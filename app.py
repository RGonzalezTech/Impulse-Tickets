import os
import enum
from datetime import datetime, time, timedelta
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import Enum

# --- Configuration ---
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, 'data', 'tickets.db') # Path inside the container

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-very-secret-key'
app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{DATABASE_PATH}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# --- Enums ---
class FrequencyUnit(enum.Enum):
	DAYS = 'days'
	WEEKS = 'weeks'
	MONTHS = 'months'

class DayOfWeek(enum.Enum):
	MON = 'MON'
	TUE = 'TUE'
	WED = 'WED'
	THU = 'THU'
	FRI = 'FRI'
	SAT = 'SAT'
	SUN = 'SUN'

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
			# Add more fields as necessary.
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
	last_distributed = db.Column(db.DateTime, nullable=True)
	issued_tickets = db.relationship('IssuedTicket', backref='ticket_type', lazy=True) # Cascade might be needed here too

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

	def __repr__(self):
		return f'<TicketType {self.name}>'


class IssuedTicket(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	ticket_type_id = db.Column(db.Integer, db.ForeignKey('ticket_type.id'), nullable=False)
	wallet_id = db.Column(db.Integer, db.ForeignKey('wallet.id'), nullable=False)
	issued_date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
	consumed_date = db.Column(db.DateTime, nullable=True)

	def to_dict(self, include_wallet=False):
		"""Helper method to convert IssuedTicket object to dictionary."""
		data = {
			'id': self.id,
			'ticket_type_id': self.ticket_type_id,
			'ticket_type_name': self.ticket_type.name, # Include name for convenience
			'wallet_id': self.wallet_id,
			'issued_date': self.issued_date.isoformat() + 'Z', # Use ISO format for JS compatibility
			'consumed_date': self.consumed_date.isoformat() + 'Z' if self.consumed_date else None,
			'is_consumed': self.consumed_date is not None
		}
		if include_wallet:
			data['wallet_name'] = self.wallet.name
		return data


	def __repr__(self):
		status = "Consumed" if self.consumed_date else "Available"
		return f'<IssuedTicket {self.id} ({self.ticket_type.name}) for {self.wallet.name} - {status}>'

# --- Scheduler ---
# scheduler = BackgroundScheduler(daemon=True)

# def distribute_tickets_job():
# 	"""Checks TicketTypes and distributes if enough time has passed."""
# 	with app.app_context():
# 		print("Running distribution check...")
# 		now = datetime.utcnow()
# 		ticket_types = TicketType.query.filter(TicketType.target_wallet_id != None).all()

# 		for tt in ticket_types:
# 			needs_distribution = False
# 			if tt.last_distributed is None:
# 				needs_distribution = True
# 			else:
# 				delta = None
# 				if tt.frequency_unit == FrequencyUnit.DAYS:
# 					delta = timedelta(days=tt.frequency_value)
# 				elif tt.frequency_unit == FrequencyUnit.WEEKS:
# 					 delta = timedelta(weeks=tt.frequency_value)

# 				if delta and (now >= tt.last_distributed + delta):
# 					 needs_distribution = True

# 			if needs_distribution and tt.target_wallet:
# 				print(f"Distributing {tt.distribute_quantity} of {tt.name} to {tt.target_wallet.name}")
# 				for _ in range(tt.distribute_quantity):
# 					new_ticket = IssuedTicket(ticket_type_id=tt.id, wallet_id=tt.target_wallet_id)
# 					db.session.add(new_ticket)
# 				tt.last_distributed = now
# 				db.session.commit()
# 			elif needs_distribution:
# 				 print(f"TicketType {tt.name} needs distribution but has no target wallet assigned.")

# --- API Routes ---

# Wallets
@app.route('/api/wallets', methods=['GET'])
def get_wallets():
	"""Returns a list of all wallets."""
	wallets = Wallet.query.all()
	return jsonify([wallet.to_dict() for wallet in wallets])

@app.route('/api/wallets', methods=['POST'])
def add_wallet():
	"""Adds a new wallet."""
	data = request.get_json()
	if not data or not data.get('name'):
		return jsonify({"error": "Wallet name is required"}), 400

	name = data['name']
	existing_wallet = Wallet.query.filter_by(name=name).first()
	if existing_wallet:
		return jsonify({"error": f"Wallet '{name}' already exists"}), 409 # 409 Conflict

	new_wallet = Wallet(name=name)
	db.session.add(new_wallet)
	db.session.commit()
	return jsonify(new_wallet.to_dict()), 201 # 201 Created

@app.route('/api/wallets/<int:wallet_id>', methods=['DELETE'])
def delete_wallet(wallet_id):
	"""Deletes a specific wallet."""
	wallet = Wallet.query.get(wallet_id)
	if not wallet:
		return jsonify({"error": "Wallet not found"}), 404

	ticket_types_assigned = TicketType.query.filter_by(target_wallet_id=wallet_id).count()
	if ticket_types_assigned > 0:
		return jsonify({
			"error": f"Cannot delete wallet '{wallet.name}' as it is assigned to {ticket_types_assigned} ticket type(s). Please reassign or delete them first."
		}), 400 # Bad Request or 409 Conflict

	db.session.delete(wallet)
	db.session.commit()
	return jsonify({"message": f"Wallet '{wallet.name}' deleted successfully"}), 200

# Ticket Types
@app.route('/api/ticket-types', methods=['GET'])
def get_ticket_types():
	"""Returns a list of all ticket types."""
	ticket_types = TicketType.query.all()
	return jsonify([tt.to_dict() for tt in ticket_types])

@app.route('/api/ticket-types', methods=['POST'])
def add_ticket_type():
	"""Adds a new ticket type."""
	data = request.get_json()
	if not data:
		return jsonify({"error": "Invalid JSON data"}), 400

	# Basic Validation
	required_fields = ['name', 'distribute_quantity', 'frequency_value', 'frequency_unit']
	if not all(field in data for field in required_fields):
		return jsonify({"error": f"Missing required fields: {required_fields}"}), 400

	name = data['name']
	description = data.get('description') # Optional
	quantity = data['distribute_quantity']
	freq_val = data['frequency_value']
	freq_unit_str = data['frequency_unit']
	target_wallet_id = data.get('target_wallet_id') # Optional

	# Type/Value Validation
	if not isinstance(name, str) or not name.strip():
		return jsonify({"error": "Invalid 'name'"}), 400
	if not isinstance(quantity, int) or quantity < 1:
		return jsonify({"error": "Invalid 'distribute_quantity' (must be integer >= 1)"}), 400
	if not isinstance(freq_val, int) or freq_val < 1:
		return jsonify({"error": "Invalid 'frequency_value' (must be integer >= 1)"}), 400

	try:
		freq_unit = FrequencyUnit(freq_unit_str)
	except ValueError:
		valid_units = [unit.value for unit in FrequencyUnit]
		return jsonify({"error": f"Invalid 'frequency_unit'. Must be one of: {valid_units}"}), 400

	# Check if name exists
	existing_type = TicketType.query.filter_by(name=name).first()
	if existing_type:
		return jsonify({"error": f"Ticket Type '{name}' already exists"}), 409

	# Check target wallet if provided
	target_wallet = None
	if target_wallet_id is not None:
		if not isinstance(target_wallet_id, int):
			 return jsonify({"error": "Invalid 'target_wallet_id' (must be integer or null)"}), 400
		target_wallet = Wallet.query.get(target_wallet_id)
		if not target_wallet:
			return jsonify({"error": f"Target wallet ID {target_wallet_id} not found"}), 404

	new_type = TicketType(
		name=name,
		description=description,
		distribute_quantity=quantity,
		frequency_value=freq_val,
		frequency_unit=freq_unit,
		target_wallet_id=target_wallet.id if target_wallet else None
	)
	db.session.add(new_type)
	db.session.commit()
	return jsonify(new_type.to_dict()), 201

@app.route('/api/ticket-types/<int:type_id>', methods=['DELETE'])
def delete_ticket_type(type_id):
	"""Deletes a specific ticket type."""
	ticket_type = TicketType.query.get(type_id)
	if not ticket_type:
		return jsonify({"error": "Ticket Type not found"}), 404

	db.session.delete(ticket_type)
	db.session.commit()
	return jsonify({"message": f"Ticket type '{ticket_type.name}' deleted successfully"}), 200

# Issued Tickets (within a wallet context)
@app.route('/api/wallets/<int:wallet_id>/tickets', methods=['GET'])
def get_wallet_tickets(wallet_id):
	"""Gets available tickets for a specific wallet."""
	wallet = Wallet.query.get(wallet_id)
	if not wallet:
		return jsonify({"error": "Wallet not found"}), 404

	# Filter for tickets belonging to this wallet AND not consumed
	available_tickets = IssuedTicket.query.filter_by(
		wallet_id=wallet.id,
		consumed_date=None
	).order_by(IssuedTicket.issued_date).all() # Order by issued date

	return jsonify([ticket.to_dict() for ticket in available_tickets])

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
	return jsonify(ticket.to_dict()), 200 # Return the updated ticket


# --- Initialization (Unchanged) ---
def initialize_database():
	"""Creates database tables if they don't exist."""
	with app.app_context():
		print(f"Ensuring database exists at: {DATABASE_PATH}")
		data_dir = os.path.dirname(DATABASE_PATH)
		if not os.path.exists(data_dir):
			 print(f"Creating data directory: {data_dir}")
			 os.makedirs(data_dir)
		db.create_all()
		print("Database tables checked/created.")

if __name__ == '__main__':
	print("Running the API server now 🔥")
	initialize_database()
	# Start the scheduler if needed - uncomment and configure
	# scheduler.add_job(distribute_tickets_job, 'interval', hours=1, id='distribute_tickets')
	# scheduler.start()
	# print("Scheduler started.")
	app.run(host='0.0.0.0', port=8000, debug=True) # Use debug=True for development