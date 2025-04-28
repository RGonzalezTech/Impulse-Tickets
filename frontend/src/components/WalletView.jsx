import React from 'react';
import TicketCard from './TicketCard';
import { motion, AnimatePresence } from 'framer-motion';
import styles from './WalletView.module.css';

function WalletView({ wallet, tickets, onConsumeTicket, onBack, onDeleteWallet, isLoading }) {

    // Calculate rotation for fanning effect
    const calculateRotation = (index, total) => {
        if (total <= 1) return 0;
        const maxAngle = Math.min(total * 5, 45); // Max total angle spread
        const anglePerCard = maxAngle / (total - 1);
        const baseAngle = -maxAngle / 2; // Center the fan
        return baseAngle + index * anglePerCard;
    };

    // Calculate translation for fanning
    const calculateTranslation = (index, total) => {
        if (total <= 1) return { x: 0, y: 0 };
        const angleRad = (calculateRotation(index, total) * Math.PI) / 180;
        const radius = 100; // How far the cards fan out from center
        const yOffsetFactor = 0.3; // How much cards move down as they rotate out

        // Adjust x based on angle, y based on how far out from center (cosine)
        const x = radius * Math.sin(angleRad);
        // Move cards slightly down as they move outward horizontally
        const y = radius * (1 - Math.cos(angleRad)) * yOffsetFactor;

        return { x, y };
    };

    const handleDeleteClick = () => {
        // Add a confirmation dialog
        if (window.confirm(`Are you sure you want to delete the wallet "${wallet.name}"? This action cannot be undone.`)) {
            if (onDeleteWallet) { // Check if the prop is provided
                onDeleteWallet(wallet.id);
            } else {
                console.error("onDeleteWallet prop not provided to WalletView");
            }
        }
    };

    return (
        <div className={styles.walletViewContainer}>
            <button onClick={onBack} className={styles.backButton}>&larr; Back to Wallets</button>
            <h2>{wallet.name}'s Tickets</h2>
            {onDeleteWallet && ( // Only render if onDeleteWallet is provided
                <button
                    onClick={handleDeleteClick}
                    className={`${styles.button} ${styles.deleteButton}`} // Add specific styling if needed
                    title={`Delete ${wallet.name} wallet`}
                >
                    Delete Wallet
                </button>
            )}

            {isLoading && !tickets.length && <p>Loading tickets...</p>}
            {!isLoading && tickets.length === 0 && <p>This wallet is empty.</p>}

            <AnimatePresence> {/* Wrap the list for exit animations */}
                <motion.div className={styles.ticketFanContainer}>
                    {tickets.map((ticket, index) => {
                        const rotation = calculateRotation(index, tickets.length);
                        const { x, y } = calculateTranslation(index, tickets.length);

                        return (
                            <TicketCard
                                key={ticket.id} // Key needed for AnimatePresence
                                ticket={ticket}
                                onConsume={() => onConsumeTicket(ticket.id)}
                                style={{
                                    // Apply transform for fanning
                                    zIndex: index, // Cards in front overlap those behind
                                }}
                                animate={{ // Use framer-motion animate prop
                                    rotate: rotation,
                                    x: x,
                                    y: y,
                                    transition: { type: 'spring', stiffness: 100, damping: 15, delay: index * 0.05 }
                                }}
                                initial={{ // Initial state before animation
                                    opacity: 0,
                                    rotate: 0, // Start flat
                                    x: 0,
                                    y: 50 // Start slightly down
                                }}
                                exit={{ // Animation when card is removed (consumed)
                                    opacity: 0,
                                    scale: 0.5,
                                    y: -100, // Fly up and fade out
                                    transition: { duration: 0.4, ease: "easeIn" }
                                }}
                                layout // Required by AnimatePresence for smooth re-ordering
                            />
                        );
                    })}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

export default WalletView;