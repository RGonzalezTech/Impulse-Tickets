import React, { useState, useEffect } from 'react';
import TicketCard from './TicketCard';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './WalletView.module.css';

function WalletView({
    wallet,
    tickets,
    onConsumeTicket,
    onBack,
    onDeleteWallet,
    onUpdateWallet, // New prop for handling the update API call
    isLoading,
    apiBaseUrl // Pass this down if needed for API calls within WalletView, though better handled in App.jsx
}) {
    // State for editing the wallet name
    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState(wallet ? wallet.name : '');
    const [editError, setEditError] = useState(null); // Local error state for editing

    // Update newName if the wallet prop changes (e.g., after successful save)
    useEffect(() => {
        if (wallet) {
            setNewName(wallet.name);
        }
    }, [wallet]);


    // --- Existing Calculation Functions (Unchanged) ---
    const calculateRotation = (index, total) => {
        if (total <= 1) return 0;
        const maxAngle = Math.min(total * 5, 45);
        const anglePerCard = maxAngle / (total - 1);
        const baseAngle = -maxAngle / 2;
        return baseAngle + index * anglePerCard;
    };

    const calculateTranslation = (index, total) => {
        if (total <= 1) return { x: 0, y: 0 };
        const angleRad = (calculateRotation(index, total) * Math.PI) / 180;
        const radius = 100;
        const yOffsetFactor = 0.3;
        const x = radius * Math.sin(angleRad);
        const y = radius * (1 - Math.cos(angleRad)) * yOffsetFactor;
        return { x, y };
    };

    // --- Event Handlers ---

    const handleDeleteClick = () => {
        if (window.confirm(`Are you sure you want to delete the wallet "${wallet.name}"? This action cannot be undone.`)) {
            if (onDeleteWallet) {
                onDeleteWallet(wallet.id);
            } else {
                console.error("onDeleteWallet prop not provided to WalletView");
            }
        }
    };

    const handleEditClick = () => {
        setIsEditingName(true);
        setNewName(wallet.name); // Ensure input starts with current name
        setEditError(null); // Clear previous edit errors
    };

    const handleCancelEdit = () => {
        setIsEditingName(false);
        setNewName(wallet.name); // Reset input to original name
        setEditError(null);
    };

    const handleSaveEdit = async () => {
        if (!newName.trim()) {
            setEditError("Wallet name cannot be empty.");
            return;
        }
        if (newName === wallet.name) {
            setIsEditingName(false); // No change, just exit edit mode
            setEditError(null);
            return;
        }

        setEditError(null); // Clear previous errors before trying to save

        if (onUpdateWallet) {
            try {
                // Let the parent component handle the API call and state update
                await onUpdateWallet(wallet.id, newName);
                setIsEditingName(false); // Exit edit mode on success
            } catch (error) {
                // Display error from the parent component if the update failed
                console.error("Failed to update wallet:", error);
                setEditError(error.message || "Failed to save wallet name.");
            }
        } else {
            console.error("onUpdateWallet prop not provided to WalletView");
            setEditError("Cannot save: Update function not available.");
        }
    };

    // Handle Enter key press in input field to save
    const handleInputKeyPress = (event) => {
        if (event.key === 'Enter') {
            handleSaveEdit();
        } else if (event.key === 'Escape') {
            handleCancelEdit();
        }
    };

    if (!wallet) {
        // Handle case where wallet might be null initially or after deletion
        return (
            <div className={styles.walletViewContainer}>
                <button onClick={onBack} className={styles.backButton}>&larr; Back to Wallets</button>
                <p>Wallet not found or has been deleted.</p>
            </div>
        );
    }

    return (
        <div className={styles.walletViewContainer}>
            <button onClick={onBack} className={styles.backButton}>&larr; Back to Wallets</button>

            {/* Wallet Title / Edit Section */}
            <div className={styles.titleContainer}>
                {isEditingName ? (
                    <div className={styles.editNameForm}>
                        <input
                            type="text"
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            onKeyDown={handleInputKeyPress} // Use onKeyDown for Escape
                            autoFocus // Focus the input when it appears
                            className={styles.editNameInput}
                        />
                        <button onClick={handleSaveEdit} className={styles.saveButton}>Save</button>
                        <button onClick={handleCancelEdit} className={styles.cancelButton}>Cancel</button>
                    </div>
                ) : (
                    <div className={styles.titleDisplay}>
                        <h2>{wallet.name}'s Tickets</h2>
                        <button onClick={handleEditClick} className={styles.editButton} title="Edit wallet name">✏️</button>
                    </div>
                )}
                 {editError && <p className={styles.editErrorText}>{editError}</p>}
            </div>

            {/* Delete Wallet Button */}
            {onDeleteWallet && (
                <button
                    onClick={handleDeleteClick}
                    className={`${styles.button} ${styles.deleteButton}`}
                    title={`Delete ${wallet.name} wallet`}
                    disabled={isEditingName} // Disable delete while editing name
                >
                    Delete Wallet
                </button>
            )}

            {/* Ticket Display Section */}
            {isLoading && !tickets.length && <p>Loading tickets...</p>}
            {!isLoading && tickets.length === 0 && <p>This wallet is empty.</p>}

            <AnimatePresence>
                <motion.div className={styles.ticketFanContainer}>
                    {tickets.map((ticket, index) => {
                        const rotation = calculateRotation(index, tickets.length);
                        const { x, y } = calculateTranslation(index, tickets.length);

                        return (
                            <TicketCard
                                key={ticket.id}
                                ticket={ticket}
                                onConsume={() => onConsumeTicket(ticket.id)}
                                style={{ zIndex: index }}
                                animate={{
                                    rotate: rotation,
                                    x: x,
                                    y: y,
                                    transition: { type: 'spring', stiffness: 100, damping: 15, delay: index * 0.05 }
                                }}
                                initial={{ opacity: 0, rotate: 0, x: 0, y: 50 }}
                                exit={{ opacity: 0, scale: 0.5, y: -100, transition: { duration: 0.4, ease: "easeIn" } }}
                                layout
                            />
                        );
                    })}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

export default WalletView;