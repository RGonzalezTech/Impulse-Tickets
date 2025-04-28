import os
import enum
import logging
import atexit # Import atexit directly
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import Enum # Removed 'event' import as it's no longer used here

# --- Configuration ---
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, 'data', 'tickets.db') # Path inside the container

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-very-secret-key' # TODO: Change in production!
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DATABASE_PATH}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
scheduler = BackgroundScheduler(daemon=True) # Initialize scheduler

# Configure logging
logging.basicConfig(level=logging.INFO)
logging.getLogger('apscheduler').setLevel(logging.WARNING) # Tone down APScheduler logs if needed


# --- Enums ---
class FrequencyUnit(enum.Enum):
	MINUTES = 'minutes'
	HOURS = 'hours'
	DAYS = 'days'
	WEEKS = 'weeks'
	MONTHS = 'months' # Note: Month calculation can be tricky (varying days)

# --- Database Models ---
class Wallet(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	name = db.Column(db.String(80), unique=True, nullable=False)
	tickets = db.relationship('IssuedTicket', backref='wallet', lazy=True, cascade="all, delete-orphan")

	def to_dict(self):
		"""Helper method to convert Wallet object to dictionary."""
		return {
			'id': self.id,
			'name': self.name,
		}

	def __repr__(self):
		return f'<Wallet {self.name}>'

class TicketType(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	name = db.Column(db.String(80), unique=True, nullable=False)
	description = db.Column(db.String(200), nullable=True)
	distribute_quantity = db.Column(db.Integer, nullable=False, default=1)
	frequency_value = db.Column(db.Integer, nullable=False, default=7)
	frequency_unit = db.Column(Enum(FrequencyUnit), nullable=False, default=FrequencyUnit.DAYS)
	target_wallet_id = db.Column(db.Integer, db.ForeignKey('wallet.id'), nullable=True)
	target_wallet = db.relationship('Wallet')
	last_distributed = db.Column(db.DateTime, nullable=True) # Stores UTC time
	issued_tickets = db.relationship('IssuedTicket', backref='ticket_type', lazy=True, cascade="all, delete-orphan") # Added cascade

	def to_dict(self):
		"""Helper method to convert TicketType object to dictionary."""
		return {
			'id': self.id,
			'name': self.name,
			'description': self.description,
			'distribute_quantity': self.distribute_quantity,
			'frequency_value': self.frequency_value,
			'frequency_unit': self.frequency_unit.value, # Return the string value
			'target_wallet_id': self.target_wallet_id,
			'target_wallet_name': self.target_wallet.name if self.target_wallet else None,
			'last_distributed': self.last_distributed.isoformat() + 'Z' if self.last_distributed else None
		}

	def get_frequency_timedelta(self):
		"""Calculates the timedelta based on frequency settings."""
		unit = self.frequency_unit
		value = self.frequency_value
		if unit == FrequencyUnit.MINUTES:
			return timedelta(minutes=value)
		elif unit == FrequencyUnit.HOURS:
			return timedelta(hours=value)
		elif unit == FrequencyUnit.DAYS:
			return timedelta(days=value)
		elif unit == FrequencyUnit.WEEKS:
			return timedelta(weeks=value)
		elif unit == FrequencyUnit.MONTHS:
			 # Note: This is an approximation using 30 days per month
			 # For precise month handling, consider dateutil.relativedelta
			return timedelta(days=value * 30)
		else:
			# Should not happen with Enum validation, but good practice
			raise ValueError(f"Invalid FrequencyUnit: {unit}")

	def __repr__(self):
		return f'<TicketType {self.name}>'


class IssuedTicket(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	ticket_type_id = db.Column(db.Integer, db.ForeignKey('ticket_type.id', ondelete='CASCADE'), nullable=False) # Added ondelete
	wallet_id = db.Column(db.Integer, db.ForeignKey('wallet.id', ondelete='CASCADE'), nullable=False) # Added ondelete
	issued_date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow) # Use UTC
	consumed_date = db.Column(db.DateTime, nullable=True) # Use UTC

	def to_dict(self, include_wallet=False):
		"""Helper method to convert IssuedTicket object to dictionary."""
		data = {
			'id': self.id,
			'ticket_type_id': self.ticket_type_id,
			'ticket_type_name': self.ticket_type.name if self.ticket_type else 'N/A', # Handle potential deletion
			'wallet_id': self.wallet_id,
			'issued_date': self.issued_date.isoformat() + 'Z', # Use ISO format for JS compatibility
			'consumed_date': self.consumed_date.isoformat() + 'Z' if self.consumed_date else None,
			'is_consumed': self.consumed_date is not None
		}
		if include_wallet:
			 # Check if wallet exists before accessing name
			data['wallet_name'] = self.wallet.name if self.wallet else 'N/A'
		return data


	def __repr__(self):
		status = "Consumed" if self.consumed_date else "Available"
		# Handle cases where related objects might be deleted
		type_name = self.ticket_type.name if self.ticket_type else '[Deleted Type]'
		wallet_name = self.wallet.name if self.wallet else '[Deleted Wallet]'
		return f'<IssuedTicket {self.id} ({type_name}) for {wallet_name} - {status}>'

# --- Validation Helpers ---

def validate_wallet_name(name, existing_wallet_id=None):
	"""Validates wallet name: required, non-empty string, unique (unless it's the existing wallet)."""
	if not name or not isinstance(name, str) or not name.strip():
		return jsonify({"error": "Wallet name is required and must be a non-empty string"}), 400

	query = Wallet.query.filter(Wallet.name == name)
	if existing_wallet_id is not None:
		query = query.filter(Wallet.id != existing_wallet_id)

	existing_wallet = query.first()
	if existing_wallet:
		return jsonify({"error": f"Wallet name '{name}' already exists"}), 409 # Conflict
	return None # No error

def validate_ticket_type_data(data, existing_type_id=None):
	"""Validates data for creating/updating a TicketType. Returns (validated_data, error_response)."""
	errors = {}
	validated_data = {}

	# --- Field Extraction (with defaults for update) ---
	existing_type = None
	if existing_type_id:
		existing_type = TicketType.query.get(existing_type_id)
		if not existing_type:
			 return None, (jsonify({"error": "Ticket Type not found"}), 404)

	def get_value(key, default_value=None):
		 if key in data:
			 return data[key]
		 if existing_type:
			 if key == 'frequency_unit':
				 return getattr(existing_type, key).value
			 return getattr(existing_type, key)
		 return default_value

	name = get_value('name')
	description = get_value('description', None)
	quantity = get_value('distribute_quantity')
	freq_val = get_value('frequency_value')
	freq_unit_str = get_value('frequency_unit')
	target_wallet_id = get_value('target_wallet_id', None)


	# --- Validation ---
	if not isinstance(name, str) or not name.strip():
		errors['name'] = "Invalid 'name' (must be non-empty string)"
	else:
		name_query = TicketType.query.filter(TicketType.name == name)
		if existing_type_id is not None:
			name_query = name_query.filter(TicketType.id != existing_type_id)
		if name_query.first():
			errors['name'] = f"Ticket Type name '{name}' already exists"
		else:
			validated_data['name'] = name

	if description is not None and not isinstance(description, str):
		 errors['description'] = "Invalid 'description' (must be string or null)"
	else:
		 validated_data['description'] = description

	if not isinstance(quantity, int) or quantity < 1:
		errors['distribute_quantity'] = "Invalid 'distribute_quantity' (must be integer >= 1)"
	else:
		 validated_data['distribute_quantity'] = quantity

	if not isinstance(freq_val, int) or freq_val < 1:
		errors['frequency_value'] = "Invalid 'frequency_value' (must be integer >= 1)"
	else:
		 validated_data['frequency_value'] = freq_val

	if freq_unit_str is None:
		 errors['frequency_unit'] = "Missing required field: 'frequency_unit'"
	else:
		try:
			freq_unit = FrequencyUnit(freq_unit_str)
			validated_data['frequency_unit'] = freq_unit
		except ValueError:
			valid_units = [unit.value for unit in FrequencyUnit]
			errors['frequency_unit'] = f"Invalid 'frequency_unit'. Must be one of: {valid_units}"

	target_wallet = None
	if target_wallet_id is not None:
		if not isinstance(target_wallet_id, int):
			errors['target_wallet_id'] = "Invalid 'target_wallet_id' (must be integer or null)"
		else:
			target_wallet = Wallet.query.get(target_wallet_id)
			if not target_wallet:
				errors['target_wallet_id'] = f"Target wallet ID {target_wallet_id} not found"
			else:
				validated_data['target_wallet_id'] = target_wallet.id
	else:
		 validated_data['target_wallet_id'] = None


	if errors:
		return None, (jsonify({"errors": errors}), 400)

	return validated_data, None

# --- Ticket Distribution Job ---

def distribute_tickets_job():
	"""
	Scheduled job to check TicketTypes and distribute tickets based on frequency.
	"""
	with app.app_context(): # Need app context to access db
		now = datetime.utcnow()
		logging.info(f"Running ticket distribution job at {now.isoformat()}Z")

		ticket_types_to_process = TicketType.query.all()
		wallets = None # Cache all wallets if needed

		for ticket_type in ticket_types_to_process:
			try:
				should_distribute = False
				if ticket_type.last_distributed is None:
					# First time distribution for this type
					should_distribute = True
					logging.info(f"TicketType '{ticket_type.name}' (ID: {ticket_type.id}): First distribution.")
				else:
					time_since_last = now - ticket_type.last_distributed
					frequency_delta = ticket_type.get_frequency_timedelta()
					if time_since_last >= frequency_delta:
						should_distribute = True
						logging.info(f"TicketType '{ticket_type.name}' (ID: {ticket_type.id}): Frequency met ({time_since_last} >= {frequency_delta}). Distributing.")
					# else:
					#     logging.debug(f"TicketType '{ticket_type.name}' (ID: {ticket_type.id}): Frequency not met ({time_since_last} < {frequency_delta}). Skipping.")


				if should_distribute:
					target_wallets = []
					if ticket_type.target_wallet_id:
						# Specific target wallet
						target_wallet = Wallet.query.get(ticket_type.target_wallet_id)
						if target_wallet:
							target_wallets.append(target_wallet)
						else:
							logging.warning(f"TicketType '{ticket_type.name}' (ID: {ticket_type.id}): Target wallet ID {ticket_type.target_wallet_id} not found. Skipping distribution for this type.")
							continue # Skip this type if target wallet is gone
					else:
						# Distribute to all wallets
						if wallets is None: # Lazy load wallets only if needed
						   wallets = Wallet.query.all()
						target_wallets = wallets

					if not target_wallets:
						logging.info(f"TicketType '{ticket_type.name}' (ID: {ticket_type.id}): No target wallets found (either specific target deleted or no wallets exist). Skipping.")
						continue

					# --- Distribution ---
					# IMPORTANT: Update last_distributed time *before* creating tickets
					# to prevent duplicates if the process fails mid-way.
					original_last_distributed = ticket_type.last_distributed
					ticket_type.last_distributed = now
					db.session.add(ticket_type) # Stage the update

					new_tickets_count = 0
					for wallet in target_wallets:
						for _ in range(ticket_type.distribute_quantity):
							new_ticket = IssuedTicket(
								ticket_type_id=ticket_type.id,
								wallet_id=wallet.id,
								issued_date=now # Use the job's start time for consistency
							)
							db.session.add(new_ticket)
							new_tickets_count += 1

					# Commit transaction for this ticket type
					db.session.commit()
					logging.info(f"TicketType '{ticket_type.name}' (ID: {ticket_type.id}): Successfully distributed {new_tickets_count} tickets across {len(target_wallets)} wallet(s). Updated last_distributed to {now.isoformat()}Z.")

			except Exception as e:
				db.session.rollback() # Rollback changes for *this specific* ticket_type on error
				logging.error(f"Error processing TicketType '{ticket_type.name}' (ID: {ticket_type.id}): {e}", exc_info=True)
				# Optionally, restore the original last_distributed time if needed,
				# but leaving it updated might prevent immediate retries if the error is persistent.
				# ticket_type.last_distributed = original_last_distributed # Revert if rollback happens? Consider implications.
				# db.session.commit() # Commit the revert?

		logging.info("Ticket distribution job finished.")


# --- API Routes ---

# Wallets
@app.route('/api/wallets', methods=['GET'])
def get_wallets():
	"""Returns a list of all wallets."""
	wallets = Wallet.query.order_by(Wallet.name).all() # Added ordering
	return jsonify([wallet.to_dict() for wallet in wallets])

@app.route('/api/wallets', methods=['POST'])
def add_wallet():
	"""Adds a new wallet."""
	data = request.get_json()
	if not data or not data.get('name'):
		return jsonify({"error": "Wallet name is required"}), 400

	name = data.get('name')
	error_response = validate_wallet_name(name)
	if error_response:
		return error_response

	new_wallet = Wallet(name=name)
	db.session.add(new_wallet)
	db.session.commit()
	logging.info(f"Wallet '{new_wallet.name}' (ID: {new_wallet.id}) created.")
	return jsonify(new_wallet.to_dict()), 201 # 201 Created

@app.route('/api/wallets/<int:wallet_id>', methods=['DELETE'])
def delete_wallet(wallet_id):
	"""Deletes a specific wallet and its associated issued tickets."""
	wallet = Wallet.query.get(wallet_id)
	if not wallet:
		return jsonify({"error": "Wallet not found"}), 404

	# Check if wallet is a target for any TicketType
	ticket_types_assigned = TicketType.query.filter_by(target_wallet_id=wallet_id).count()
	if ticket_types_assigned > 0:
		return jsonify({
			"error": f"Cannot delete wallet '{wallet.name}' as it is the target for {ticket_types_assigned} ticket type(s). Please reassign or delete them first."
		}), 400 # Bad Request or 409 Conflict

	wallet_name = wallet.name # Store name for logging before deletion
	# cascade="all, delete-orphan" on Wallet.tickets relationship handles IssuedTicket deletion
	db.session.delete(wallet)
	db.session.commit()
	logging.info(f"Wallet '{wallet_name}' (ID: {wallet_id}) and associated issued tickets deleted.")
	return jsonify({"message": f"Wallet '{wallet_name}' deleted successfully"}), 200

@app.route('/api/wallets/<int:wallet_id>', methods=['PUT'])
def update_wallet(wallet_id):
	"""Updates an existing wallet."""
	wallet = Wallet.query.get(wallet_id)
	if not wallet:
		return jsonify({"error": "Wallet not found"}), 404

	data = request.get_json()
	if not data:
		return jsonify({"error": "Invalid JSON data"}), 400

	new_name = data.get('name')
	error_response = validate_wallet_name(new_name, existing_wallet_id=wallet_id)
	if error_response:
		return error_response

	old_name = wallet.name
	wallet.name = new_name
	db.session.commit()
	logging.info(f"Wallet ID {wallet_id} name updated from '{old_name}' to '{new_name}'.")
	return jsonify(wallet.to_dict()), 200

# Ticket Types
@app.route('/api/ticket-types', methods=['GET'])
def get_ticket_types():
	"""Returns a list of all ticket types."""
	ticket_types = TicketType.query.order_by(TicketType.name).all() # Added ordering
	return jsonify([tt.to_dict() for tt in ticket_types])

@app.route('/api/ticket-types', methods=['POST'])
def add_ticket_type():
	"""Adds a new ticket type."""
	data = request.get_json()
	if not data:
		return jsonify({"error": "Invalid JSON data"}), 400

	# Use validation function
	validated_data, error_response = validate_ticket_type_data(data)
	if error_response:
		return error_response

	new_type = TicketType(**validated_data)
	db.session.add(new_type)
	db.session.commit()
	logging.info(f"Ticket Type '{new_type.name}' (ID: {new_type.id}) created.")
	return jsonify(new_type.to_dict()), 201

@app.route('/api/ticket-types/<int:type_id>', methods=['PUT'])
def update_ticket_type(type_id):
	"""Updates an existing ticket type."""
	ticket_type = TicketType.query.get(type_id)
	if not ticket_type:
		return jsonify({"error": "Ticket Type not found"}), 404

	data = request.get_json()
	if not data:
		return jsonify({"error": "Invalid JSON data"}), 400

	validated_data, error_response = validate_ticket_type_data(data, existing_type_id=type_id)
	if error_response:
		return error_response

	# --- Update fields ---
	updated_fields = []
	for key, value in validated_data.items():
		if getattr(ticket_type, key) != value:
			updated_fields.append(key)
			setattr(ticket_type, key, value)

	if updated_fields:
		db.session.commit()
		logging.info(f"Ticket Type '{ticket_type.name}' (ID: {type_id}) updated fields: {', '.join(updated_fields)}.")
	else:
		logging.info(f"Ticket Type '{ticket_type.name}' (ID: {type_id}) update requested, but no changes detected.")


	return jsonify(ticket_type.to_dict()), 200

@app.route('/api/ticket-types/<int:type_id>', methods=['DELETE'])
def delete_ticket_type(type_id):
	"""Deletes a specific ticket type and its associated issued tickets."""
	ticket_type = TicketType.query.get(type_id)
	if not ticket_type:
		return jsonify({"error": "Ticket Type not found"}), 404

	type_name = ticket_type.name # Store for logging
	# cascade="all, delete-orphan" on TicketType.issued_tickets handles IssuedTicket deletion
	# Also added ondelete='CASCADE' to FKs in IssuedTicket for good measure
	db.session.delete(ticket_type)
	db.session.commit()
	logging.info(f"Ticket Type '{type_name}' (ID: {type_id}) and associated issued tickets deleted.")
	return jsonify({"message": f"Ticket type '{type_name}' deleted successfully"}), 200

# Issued Tickets (within a wallet context)
@app.route('/api/wallets/<int:wallet_id>/tickets', methods=['GET'])
def get_wallet_tickets(wallet_id):
	"""Gets available (unconsumed) tickets for a specific wallet."""
	wallet = Wallet.query.get(wallet_id)
	if not wallet:
		return jsonify({"error": "Wallet not found"}), 404

	# Filter for tickets belonging to this wallet AND not consumed
	available_tickets = IssuedTicket.query.filter_by(
		wallet_id=wallet.id,
		consumed_date=None
	).order_by(IssuedTicket.issued_date.desc()).all() # Order by newest first

	return jsonify([ticket.to_dict(include_wallet=True) for ticket in available_tickets])

# Action: Consume Ticket
@app.route('/api/tickets/<int:ticket_id>/consume', methods=['POST'])
def consume_ticket(ticket_id):
	"""Marks a specific ticket as consumed."""
	ticket = IssuedTicket.query.get(ticket_id)
	if not ticket:
		return jsonify({"error": "Ticket not found"}), 404

	if ticket.consumed_date is not None:
		return jsonify({"error": "Ticket already consumed"}), 409 # Conflict

	ticket.consumed_date = datetime.utcnow()
	db.session.commit()
	logging.info(f"Ticket ID {ticket_id} (Type: {ticket.ticket_type.name if ticket.ticket_type else 'N/A'}, Wallet: {ticket.wallet.name if ticket.wallet else 'N/A'}) consumed.")
	return jsonify(ticket.to_dict(include_wallet=True)), 200 # Return the updated ticket

# --- Initialization ---
def initialize_database():
	"""Creates database tables if they don't exist."""
	with app.app_context():
		logging.info(f"Ensuring database exists at: {DATABASE_PATH}")
		data_dir = os.path.dirname(DATABASE_PATH)
		if not os.path.exists(data_dir):
			 logging.info(f"Creating data directory: {data_dir}")
			 os.makedirs(data_dir)
		db.create_all()
		logging.info("Database tables checked/created.")

# --- Scheduler Setup ---
def start_scheduler():
	"""Adds the job and starts the scheduler."""
	# Check if job already exists to prevent duplicates during hot reload
	if not scheduler.get_job('distribute_tickets'):
		 # Run every 60 seconds
		scheduler.add_job(
			func=distribute_tickets_job,
			trigger='interval',
			seconds=60, # Adjust interval as needed
			id='distribute_tickets',
			name='Distribute Tickets Regularly',
			replace_existing=True
		)
		logging.info("Ticket distribution job added to scheduler.")
	else:
		logging.info("Ticket distribution job already scheduled.")

	if not scheduler.running:
		scheduler.start()
		logging.info("Scheduler started.")
	else:
		logging.info("Scheduler already running.")

# --- Removed problematic SQLAlchemy event listener ---
# @event.listens_for(db.engine, "connect")
# def setup_scheduler_shutdown(dbapi_connection, connection_record):
#     """Ensure scheduler shutdown happens reliably."""
#     # This approach caused RuntimeError: Working outside of application context.
#     # Moved atexit registration to main block.
#     pass # Keep function definition empty or remove entirely


# if __name__ == '__main__':
# 	logging.info("Initializing database...")
# 	initialize_database()
# 	logging.info("Starting ticket distribution scheduler...")
# 	start_scheduler()

# 	# --- Register scheduler shutdown ---
# 	# Use atexit to ensure the scheduler attempts to shut down cleanly.
# 	# Note: atexit might not be reliable with all WSGI server configurations
# 	# (e.g., worker processes might be killed before the hook runs).
# 	# More robust solutions might involve WSGI server hooks if available.
# 	logging.info("Registering scheduler shutdown hook...")
# 	atexit.register(lambda: scheduler.shutdown())
# 	logging.info("Scheduler shutdown hook registered.")


# 	logging.info("Running the API server now 🔥 (Debug Mode: ON)")
# 	# Use use_reloader=False to prevent scheduler from starting twice in debug mode
# 	# For production, use a proper WSGI server like Gunicorn or uWSGI
# 	app.run(host='0.0.0.0', port=8000, debug=True, use_reloader=False)

# --- Initialization ---
logging.info("Initializing database...")
initialize_database()
logging.info("Starting ticket distribution scheduler...")
start_scheduler()
logging.info("Registering scheduler shutdown hook...")
atexit.register(lambda: scheduler.shutdown())
logging.info("Scheduler shutdown hook registered.")