import React, { useState, useEffect, useCallback } from 'react';
import styles from './TicketTypeManager.module.css';

// Placeholder frequencies - match your API's FrequencyUnit enum
const frequencyUnits = ['minutes', 'hours', 'days', 'weeks', 'months'];

function TicketTypeManager({ apiBaseUrl, wallets, onTicketTypesUpdated }) {
    const [ticketTypes, setTicketTypes] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Form state
    const [editingTypeId, setEditingTypeId] = useState(null); // ID of the type being edited
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [freqValue, setFreqValue] = useState(7);
    const [freqUnit, setFreqUnit] = useState(frequencyUnits[0]); // Default to days
    const [targetWalletId, setTargetWalletId] = useState(''); // Store as string for select value
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch Ticket Types
    const fetchTicketTypes = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${apiBaseUrl}/ticket-types`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            // Calculate next distribution time for each type upon fetching
            const typesWithNextDist = data.map(tt => ({
                ...tt,
                // Call the helper function here
                nextDistributionTime: calculateNextDistribution(tt)
            }));
            // Set the state with the augmented data
            setTicketTypes(typesWithNextDist);
        } catch (e) {
            console.error("Failed to fetch ticket types:", e);
            setError('Could not load ticket types.');
        } finally {
            setIsLoading(false);
        }
    });

    // Delete Ticket Type
    const deleteTicketType = async (typeId) => {
        if (!window.confirm("Are you sure you want to delete this ticket type? This cannot be undone.")) {
            return;
        }
        // You might want to add visual feedback while deleting
        setError(null);
        try {
            const response = await fetch(`${apiBaseUrl}/ticket-types/${typeId}`, {
                method: 'DELETE',
            });
            const data = await response.json(); // Get response body even for DELETE
            if (!response.ok) {
                throw new Error(data.message || `HTTP error! status: ${response.status}`);
            }
            // Remove from local state
            setTicketTypes(currentTypes => currentTypes.filter(t => t.id !== typeId));
            // Optionally call onTicketTypesUpdated()
        } catch (e) {
            console.error(`Failed to delete ticket type ${typeId}:`, e);
            setError(`Could not delete ticket type: ${e.message}`);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        const ticketTypeData = {
            name,
            description: description || null,
            distribute_quantity: parseInt(quantity, 10),
            frequency_value: parseInt(freqValue, 10),
            frequency_unit: freqUnit,
            target_wallet_id: targetWalletId ? parseInt(targetWalletId, 10) : null,
        };

        const isEditing = editingTypeId !== null;
        const url = isEditing ? `${apiBaseUrl}/ticket-types/${editingTypeId}` : `${apiBaseUrl}/ticket-types`;
        const method = isEditing ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ticketTypeData),
            });
            const data = await response.json(); // Assuming API returns updated/created object

            if (!response.ok) {
                // Improved error handling: check for specific backend error messages
                let errorMsg = data.error || (data.errors ? JSON.stringify(data.errors) : `HTTP error! status: ${response.status}`);
                throw new Error(errorMsg);
            }

            if (isEditing) {
                // Update the type in the local state
                fetchTicketTypes()
                // Reset editing state after successful update
                handleCancelEdit(); // Call reset function (defined below)
            } else {
                // Add the new type to the local state
                fetchTicketTypes()
                resetForm(); // Reset form fields only for adding
            }

        } catch (err) {
            console.error(`Failed to ${isEditing ? 'update' : 'add'} ticket type:`, err);
            setError(err.message || `Could not ${isEditing ? 'update' : 'add'} ticket type.`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Helper to reset form fields
    const resetForm = () => {
        setName('');
        setDescription('');
        setQuantity(1);
        setFreqValue(7);
        setFreqUnit(frequencyUnits[0]); // Or your default
        setTargetWalletId('');
    }

    // Helper to cancel editing and reset form
    const handleCancelEdit = () => {
        setEditingTypeId(null);
        resetForm();
        setError(null); // Clear errors
    };

    // Add this function inside the TicketTypeManager component:
    const handleEditClick = (ticketType) => {
        setEditingTypeId(ticketType.id);
        setName(ticketType.name);
        setDescription(ticketType.description || ''); // Handle null description
        setQuantity(ticketType.distribute_quantity);
        setFreqValue(ticketType.frequency_value);
        setFreqUnit(ticketType.frequency_unit); // Ensure this matches the value from API
        setTargetWalletId(ticketType.target_wallet_id !== null ? String(ticketType.target_wallet_id) : ''); // Handle null and convert to string for select
        setError(null); // Clear previous errors
    };

    // Fetch on mount
    useEffect(() => {
        fetchTicketTypes();
    }, [fetchTicketTypes]); // Run only once on mount

    // --- Helper Function for Time Difference Formatting ---
    const formatTimeDifference = (diffMs) => {
        if (diffMs <= 0) {
            return "Ready";
        }

        const totalSeconds = Math.floor(diffMs / 1000);
        const totalMinutes = Math.floor(totalSeconds / 60);
        const totalHours = Math.floor(totalMinutes / 60);
        const days = Math.floor(totalHours / 24);

        const seconds = totalSeconds % 60;
        const minutes = totalMinutes % 60;
        const hours = totalHours % 24;

        let parts = [];
        if (days > 0) parts.push(`${days}d`);
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        // Optionally add seconds: if (seconds > 0 && parts.length < 2) parts.push(`${seconds}s`);

        if (parts.length === 0) {
            return "Less than a minute";
        }

        return parts.join(' ');
    };

    // --- Helper Function to Calculate Next Distribution Time ---
    const calculateNextDistribution = (ticketType) => {
        if (!ticketType.last_distributed)
            return null; // Never distributed before, maybe show "Ready"? Or calculate based on creation? For now, null.

        const lastDistributedDate = new Date(ticketType.last_distributed);
        if (isNaN(lastDistributedDate)) {
            console.error("Invalid last_distributed date:", ticketType.last_distributed);
            return null; // Invalid date
        }

        const value = ticketType.frequency_value;
        const unit = ticketType.frequency_unit;
        let nextDistributionDate = new Date(lastDistributedDate);

        // Note: 'months' is tricky due to variable days. This is an approximation.
        // Consider using a date library like date-fns or moment for more robust calculations.
        switch (unit) {
            case 'minutes':
                nextDistributionDate.setMinutes(nextDistributionDate.getMinutes() + value);
                break;
            case 'hours':
                nextDistributionDate.setHours(nextDistributionDate.getHours() + value);
                break;
            case 'days':
                nextDistributionDate.setDate(nextDistributionDate.getDate() + value);
                break;
            case 'weeks':
                nextDistributionDate.setDate(nextDistributionDate.getDate() + value * 7);
                break;
            case 'months': // Approximation
                nextDistributionDate.setMonth(nextDistributionDate.getMonth() + value);
                break;
            default:
                console.error("Unknown frequency unit:", unit);
                return null; // Unknown unit
        }
        return nextDistributionDate;
    }

    // --- Countdown Display Component ---
    function CountdownTimer({ nextDistributionTime }) {
        const [now, setNow] = useState(new Date());

        useEffect(() => {
            if (!nextDistributionTime) return; // Don't start interval if no target time

            // Update every minute. If you need seconds, change to 1000.
            const intervalId = setInterval(() => {
                setNow(new Date());
            }, 60000);

            // Clear interval on component unmount
            return () => clearInterval(intervalId);
        }, [nextDistributionTime]); // Re-run effect if nextDistributionTime changes

        if (!nextDistributionTime) {
            // Handle cases where distribution hasn't happened or calculation failed
            return <span className={styles.countdown}>Ready</span>; // Or null, or ""
        }

        const diffMs = nextDistributionTime.getTime() - now.getTime();

        return (
            <span className={styles.countdown}>
                {/* Adjust format/text as needed */}
                {diffMs > 0 ? `Next in: ${formatTimeDifference(diffMs)}` : "Ready"}
            </span>
        );
    }

    return (
        <div className={styles.managerContainer}>
            <h2>Manage Ticket Types</h2>

            {error && <p className={styles.errorText}>{error} <button onClick={() => setError(null)} className={styles.dismissError}>&times;</button></p>}

            <form onSubmit={handleSubmit} className={styles.addForm}>
                <h3>{editingTypeId ? 'Edit Ticket Type' : 'Add New Type'}</h3>
                <div className={styles.formGrid}>
                    <label>Name*:</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} required />

                    <label>Description:</label>
                    <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="(Optional)" />

                    <label>Quantity*:</label>
                    <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} min="1" required />

                    <label>Frequency*:</label>
                    <div className={styles.frequencyControl}>
                        Every
                        <input type="number" value={freqValue} onChange={e => setFreqValue(e.target.value)} min="1" required />
                        <select value={freqUnit} onChange={e => setFreqUnit(e.target.value)} required>
                            {frequencyUnits.map(unit => <option key={unit} value={unit}>{unit}</option>)}
                        </select>
                    </div>

                    <label>Target Wallet:</label>
                    <select value={targetWalletId} onChange={e => setTargetWalletId(e.target.value)}>
                        <option value="">All Wallets</option>
                        {wallets.map(wallet => (
                            <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                        ))}
                    </select>
                </div>
                <div className={styles.formActions}>
                    <button type="submit" disabled={isSubmitting || !name.trim() /* ... other validations */}>
                        {isSubmitting ? (editingTypeId ? 'Saving...' : 'Adding...') : (editingTypeId ? 'Save Changes' : 'Add Ticket Type')}
                    </button>
                    {editingTypeId && ( // Show Cancel button only when editing
                        <button type="button" onClick={handleCancelEdit} disabled={isSubmitting}>
                            Cancel Edit
                        </button>
                    )}
                </div>
            </form>

            {/* List Existing Ticket Types */}
            <div className={styles.listSection}>
                <h3>Existing Types</h3>
                {isLoading && <p>Loading types...</p>}
                {ticketTypes.length === 0 && !isLoading && <p>No ticket types defined yet.</p>}
                <ul className={styles.typeList}>
                    {ticketTypes.map(tt => (
                        <li key={tt.id} className={styles.typeItem}>
                            <div className={styles.typeDetails}>
                                <strong>{tt.name}</strong> ({tt.distribute_quantity} every {tt.frequency_value} {tt.frequency_unit})
                                {tt.description && <span className={styles.description}> - {tt.description}</span>}
                                <br />
                                <span className={styles.targetWallet}>
                                    Target: {tt.target_wallet_name || '(All Wallets)'}
                                </span>
                                <CountdownTimer nextDistributionTime={tt.nextDistributionTime} />
                            </div>
                            <div className={styles.buttonGroup}>
                                <button
                                    onClick={() => handleEditClick(tt)}
                                    className={styles.editButton}
                                >
                                    Edit
                                </button>
                                <button onClick={() => deleteTicketType(tt.id)} className={styles.deleteButton}>
                                    Delete
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default TicketTypeManager;