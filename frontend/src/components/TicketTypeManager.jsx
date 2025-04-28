import React, { useState, useEffect } from 'react';
import styles from './TicketTypeManager.module.css';

// Placeholder frequencies - match your API's FrequencyUnit enum
const frequencyUnits = ['days', 'weeks', 'months'];

function TicketTypeManager({ apiBaseUrl, wallets, onTicketTypesUpdated }) {
    const [ticketTypes, setTicketTypes] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Form state
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [freqValue, setFreqValue] = useState(7);
    const [freqUnit, setFreqUnit] = useState(frequencyUnits[0]); // Default to days
    const [targetWalletId, setTargetWalletId] = useState(''); // Store as string for select value
    const [isSubmitting, setIsSubmitting] = useState(false);


    // Fetch Ticket Types
    const fetchTicketTypes = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const response = await fetch(`${apiBaseUrl}/ticket-types`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            setTicketTypes(data);
        } catch (e) {
            console.error("Failed to fetch ticket types:", e);
            setError('Could not load ticket types.');
        } finally {
            setIsLoading(false);
        }
    };

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


    // Add Ticket Type
    const handleAddTicketType = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        const newTicketType = {
            name,
            description: description || null, // Send null if empty
            distribute_quantity: parseInt(quantity, 10),
            frequency_value: parseInt(freqValue, 10),
            frequency_unit: freqUnit,
            target_wallet_id: targetWalletId ? parseInt(targetWalletId, 10) : null,
        };

        try {
            const response = await fetch(`${apiBaseUrl}/ticket-types`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newTicketType),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }
            // Add to local state and clear form
            setTicketTypes(currentTypes => [...currentTypes, data]);
            setName('');
            setDescription('');
            setQuantity(1);
            setFreqValue(7);
            setFreqUnit(frequencyUnits[0]);
            setTargetWalletId('');
            // Optionally call onTicketTypesUpdated()

        } catch (err) {
            console.error("Failed to add ticket type:", err);
            setError(err.message || "Could not add ticket type.");
        } finally {
            setIsSubmitting(false);
        }
    };


    // Fetch on mount
    useEffect(() => {
        fetchTicketTypes();
    }, []); // Run only once on mount

    return (
        <div className={styles.managerContainer}>
            <h2>Manage Ticket Types</h2>

            {error && <p className={styles.errorText}>{error} <button onClick={() => setError(null)} className={styles.dismissError}>&times;</button></p>}

            {/* Add New Ticket Type Form */}
            <form onSubmit={handleAddTicketType} className={styles.addForm}>
                <h3>Add New Type</h3>
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
                        <option value="">(None - Manual Distribution)</option>
                        {wallets.map(wallet => (
                            <option key={wallet.id} value={wallet.id}>{wallet.name}</option>
                        ))}
                    </select>
                </div>
                <button type="submit" disabled={isSubmitting || !name.trim() || !quantity || !freqValue}>
                    {isSubmitting ? 'Adding...' : 'Add Ticket Type'}
                </button>
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
                                    Target: {tt.target_wallet_name || '(None)'}
                                </span>
                            </div>
                            <button onClick={() => deleteTicketType(tt.id)} className={styles.deleteButton}>
                                Delete
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}

export default TicketTypeManager;