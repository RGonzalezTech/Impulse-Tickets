import React, { useState } from 'react';
import { motion } from 'framer-motion';
import styles from './WalletList.module.css';

function WalletList({ wallets, onSelectWallet, onRefresh, apiBaseUrl, setWallets }) {
    const [newWalletName, setNewWalletName] = useState('');
    const [isAdding, setIsAdding] = useState(false);
    const [error, setError] = useState(null);

    const handleAddWallet = async (e) => {
        e.preventDefault();
        if (!newWalletName.trim()) {
            setError("Wallet name cannot be empty.");
            return;
        }
        setIsAdding(true);
        setError(null);
        try {
            const response = await fetch(`${apiBaseUrl}/wallets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newWalletName }),
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || `HTTP error! status: ${response.status}`);
            }
            // Add new wallet to the state in App.jsx
            setWallets(currentWallets => [...currentWallets, data]);
            setNewWalletName(''); // Clear input
        } catch (err) {
            console.error("Failed to add wallet:", err);
            setError(err.message || "Could not add wallet.");
        } finally {
            setIsAdding(false);
        }
    };

    // Very basic card deck appearance
    const getWalletStyle = (index) => ({
        zIndex: wallets.length - index,
        // Slight offset for stacking illusion
        marginLeft: index > 0 ? `-${(wallets.length - index) * 0 + 75}px` : '0px',
        marginTop: index > 0 ? `${index * 5}px` : '0px', // Add some vertical offset too
    });

    return (
        <div className={styles.walletListContainer}>
            <h2>Your Wallets <button onClick={onRefresh} title="Refresh Wallets">&#x21bb;</button></h2>
            {/* Add Wallet Form */}
            <form onSubmit={handleAddWallet} className={styles.addWalletForm}>
                <input
                    type="text"
                    value={newWalletName}
                    onChange={(e) => setNewWalletName(e.target.value)}
                    placeholder="New wallet name"
                    disabled={isAdding}
                />
                <button type="submit" disabled={isAdding}>
                    {isAdding ? 'Adding...' : 'Add Wallet'}
                </button>
                {error && <p className={styles.errorText}>{error}</p>}
            </form>

            {wallets.length === 0 && <p>No wallets found. Add one!</p>}

            <div className={styles.walletsDisplay}>
                {wallets.map((wallet, index) => (
                    <motion.div
                        key={wallet.id}
                        className={styles.walletDeck}
                        style={getWalletStyle(index)}
                        initial={{ opacity: 0, y: 50 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1, duration: 0.5 }}
                        whileHover={{ scale: 1.05, zIndex: wallets.length + 1, x: 10 }} // Bring to front and scale on hover
                        onClick={() => onSelectWallet(wallet)}
                    >
                        <div className={styles.walletTopCard}>
                            <span>{wallet.name}</span>
                            {/* Maybe show ticket count here if available */}
                        </div>
                        {/* Static representation of stacked cards */}
                        <div className={`${styles.walletCardStack} ${styles.stack2}`}></div>
                        <div className={`${styles.walletCardStack} ${styles.stack3}`}></div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}

export default WalletList;