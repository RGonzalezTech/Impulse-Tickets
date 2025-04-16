# app.py
import os
import enum
from datetime import datetime, time
from flask import Flask, render_template, request, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import Enum

# --- Configuration ---
BASE_DIR = os.path.abspath(os.path.dirname(__file__))
DATABASE_PATH = os.path.join(BASE_DIR, 'data', 'tickets.db') # Path inside the container

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-very-secret-key' # Change this for production
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
	# image_path = db.Column(db.String(120), nullable=True) # Add later if needed
	tickets = db.relationship('IssuedTicket', backref='wallet', lazy=True, cascade="all, delete-orphan")

	def __repr__(self):
		return f'<Wallet {self.name}>'

class TicketType(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	name = db.Column(db.String(80), unique=True, nullable=False)
	description = db.Column(db.String(200), nullable=True)
	# image_path = db.Column(db.String(120), nullable=True) # Add later if needed

	# Simplified Schedule: Distribute X tickets every Y days/weeks/months
	distribute_quantity = db.Column(db.Integer, nullable=False, default=1)
	frequency_value = db.Column(db.Integer, nullable=False, default=7) # e.g., 7
	frequency_unit = db.Column(Enum(FrequencyUnit), nullable=False, default=FrequencyUnit.DAYS) # e.g., 'days'
	target_wallet_id = db.Column(db.Integer, db.ForeignKey('wallet.id'), nullable=True) # Assign to specific wallet or None for manual/future logic
	target_wallet = db.relationship('Wallet') # Relationship for easy access

	# Store the datetime of the last distribution to check if it's time again
	last_distributed = db.Column(db.DateTime, nullable=True)

	issued_tickets = db.relationship('IssuedTicket', backref='ticket_type', lazy=True)

	def __repr__(self):
		return f'<TicketType {self.name}>'


class IssuedTicket(db.Model):
	id = db.Column(db.Integer, primary_key=True)
	ticket_type_id = db.Column(db.Integer, db.ForeignKey('ticket_type.id'), nullable=False)
	wallet_id = db.Column(db.Integer, db.ForeignKey('wallet.id'), nullable=False)
	issued_date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
	consumed_date = db.Column(db.DateTime, nullable=True) # Null if not consumed

	def __repr__(self):
		status = "Consumed" if self.consumed_date else "Available"
		return f'<IssuedTicket {self.id} ({self.ticket_type.name}) for {self.wallet.name} - {status}>'

# --- Scheduler ---
scheduler = BackgroundScheduler(daemon=True)

def distribute_tickets_job():
	"""Checks TicketTypes and distributes if enough time has passed."""
	with app.app_context(): # Need app context for DB operations
		print("Running distribution check...")
		now = datetime.utcnow()
		ticket_types = TicketType.query.filter(TicketType.target_wallet_id != None).all()

		for tt in ticket_types:
			needs_distribution = False
			if tt.last_distributed is None:
				needs_distribution = True # First time distribution
			else:
				delta = None
				if tt.frequency_unit == FrequencyUnit.DAYS:
					delta = timedelta(days=tt.frequency_value)
				elif tt.frequency_unit == FrequencyUnit.WEEKS:
					 delta = timedelta(weeks=tt.frequency_value)
				# Add MONTHS logic if needed (more complex due to varying month lengths)

				if delta and (now >= tt.last_distributed + delta):
					 needs_distribution = True

			if needs_distribution and tt.target_wallet:
				print(f"Distributing {tt.distribute_quantity} of {tt.name} to {tt.target_wallet.name}")
				for _ in range(tt.distribute_quantity):
					new_ticket = IssuedTicket(ticket_type_id=tt.id, wallet_id=tt.target_wallet_id)
					db.session.add(new_ticket)
				tt.last_distributed = now # Update last distributed time
				db.session.commit()
			elif needs_distribution:
				 print(f"TicketType {tt.name} needs distribution but has no target wallet assigned.")

# --- Routes ---
@app.route('/')
def index():
	wallets = Wallet.query.all()
	ticket_types = TicketType.query.all()
	return render_template('index.html', wallets=wallets, ticket_types=ticket_types)

@app.route('/wallet/<int:wallet_id>')
def view_wallet(wallet_id):
	wallet = Wallet.query.get_or_404(wallet_id)
	# Get only available tickets for this wallet
	available_tickets = IssuedTicket.query.filter_by(wallet_id=wallet.id, consumed_date=None).all()
	return render_template('wallet.html', wallet=wallet, tickets=available_tickets)

@app.route('/add_wallet', methods=['POST'])
def add_wallet():
	name = request.form.get('wallet_name')
	if name:
		existing_wallet = Wallet.query.filter_by(name=name).first()
		if not existing_wallet:
			new_wallet = Wallet(name=name)
			db.session.add(new_wallet)
			db.session.commit()
			flash(f'Wallet "{name}" created successfully!', 'success')
		else:
			flash(f'Wallet "{name}" already exists.', 'warning')
	else:
		flash('Wallet name cannot be empty.', 'danger')
	return redirect(url_for('index'))

@app.route('/add_ticket_type', methods=['POST'])
def add_ticket_type():
	name = request.form.get('ticket_name')
	description = request.form.get('ticket_description')
	quantity = request.form.get('distribute_quantity', type=int)
	freq_val = request.form.get('frequency_value', type=int)
	freq_unit_str = request.form.get('frequency_unit')
	target_wallet_id = request.form.get('target_wallet_id', type=int) # Get wallet ID from form

	# Validate required fields
	if not name or quantity is None or freq_val is None or not freq_unit_str:
		 flash('Missing required fields for ticket type.', 'danger')
		 return redirect(url_for('index'))

	try:
		freq_unit = FrequencyUnit(freq_unit_str) # Convert string to Enum
	except ValueError:
		flash('Invalid frequency unit selected.', 'danger')
		return redirect(url_for('index'))

	if name:
		existing_type = TicketType.query.filter_by(name=name).first()
		if not existing_type:
			 # Check if target_wallet_id exists if provided
			 target_wallet = None
			 if target_wallet_id and target_wallet_id != 0: # Assuming 0 means 'None' or handle differently
				 target_wallet = Wallet.query.get(target_wallet_id)
				 if not target_wallet:
					 flash(f'Target wallet ID {target_wallet_id} not found.', 'danger')
					 return redirect(url_for('index'))

			 new_type = TicketType(
				 name=name,
				 description=description,
				 distribute_quantity=quantity,
				 frequency_value=freq_val,
				 frequency_unit=freq_unit,
				 target_wallet_id=target_wallet.id if target_wallet else None # Store ID or None
			)
			 db.session.add(new_type)
			 db.session.commit()
			 flash(f'Ticket Type "{name}" created successfully!', 'success')
			 # Add/Update scheduler job if needed (more complex logic)
		else:
			 flash(f'Ticket Type "{name}" already exists.', 'warning')
	else:
		flash('Ticket Type name cannot be empty.', 'danger')

	return redirect(url_for('index'))


@app.route('/consume/<int:ticket_id>', methods=['POST'])
def consume_ticket(ticket_id):
	ticket = IssuedTicket.query.get_or_404(ticket_id)
	if ticket.consumed_date is None:
		ticket.consumed_date = datetime.utcnow()
		db.session.commit()
		flash(f'Ticket "{ticket.ticket_type.name}" consumed!', 'success')
	else:
		flash('Ticket already consumed.', 'warning')
	# Redirect back to the wallet view it came from
	return redirect(url_for('view_wallet', wallet_id=ticket.wallet_id))

@app.route('/delete_wallet/<int:wallet_id>', methods=['POST'])
def delete_wallet(wallet_id):
	wallet = Wallet.query.get_or_404(wallet_id)
	# Optional: Check if wallet has tickets assigned in TicketTypes before deleting
	# ticket_types_assigned = TicketType.query.filter_by(target_wallet_id=wallet_id).count()
	# if ticket_types_assigned > 0:
	#     flash(f'Cannot delete wallet "{wallet.name}" as it is assigned to ticket types.', 'danger')
	#     return redirect(url_for('index'))

	db.session.delete(wallet)
	db.session.commit()
	flash(f'Wallet "{wallet.name}" deleted.', 'success')
	return redirect(url_for('index'))

@app.route('/delete_ticket_type/<int:type_id>', methods=['POST'])
def delete_ticket_type(type_id):
	ticket_type = TicketType.query.get_or_404(type_id)
	# Optional: Check for issued tickets before deleting type? Or cascade delete them?
	# Currently, issued tickets will remain but might cause issues if type is gone.
	# Consider adding cascade delete or preventing deletion if tickets exist.

	db.session.delete(ticket_type)
	db.session.commit()
	flash(f'Ticket type "{ticket_type.name}" deleted.', 'success')
	return redirect(url_for('index'))


# --- Initialization ---
def initialize_database():
	"""Creates database tables if they don't exist."""
	with app.app_context():
		print(f"Ensuring database exists at: {DATABASE_PATH}")
		# Ensure the data directory exists
		data_dir = os.path.dirname(DATABASE_PATH)
		if not os.path.exists(data_dir):
			 print(f"Creating data directory: {data_dir}")
			 os.makedirs(data_dir)
		db.create_all()
		print("Database tables checked/created.")

if __name__ == '__main__':
	print("Running the app now 🔥")
	initialize_database()
	# Start the scheduler - run the check job every hour (adjust as needed)
	# You might want a more sophisticated check based on the frequencies defined
	# scheduler.add_job(distribute_tickets_job, 'interval', hours=1, id='distribute_tickets')
	# scheduler.start()
	print("Scheduler started (currently disabled - enable and configure add_job).")
	app.run(host='0.0.0.0', port=8000, debug=False) # Turn debug=False for production/stable use