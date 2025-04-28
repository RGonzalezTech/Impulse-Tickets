import React, { useState, useEffect } from 'react';
import WalletList from './components/WalletList';
import WalletView from './components/WalletView';
import TicketTypeManager from './components/TicketTypeManager'; // Placeholder
import styles from './App.module.css';

const API_BASE_URL = '/api';

const VIEW_ENUM = {
  WALLETS: 'wallets',
  DETAIL: 'walletDetail',
  TICKET_TYPES: 'ticketTypes',
};

function App() {
  const [wallets, setWallets] = useState([]);
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState(VIEW_ENUM.WALLETS);

  // Fetch Wallets
  const fetchWallets = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/wallets`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setWallets(data);
    } catch (e) {
      console.error("Failed to fetch wallets:", e);
      setError('Could not load wallets. Is the API running?');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Tickets for a selected wallet
  const fetchTickets = async (walletId) => {
    if (!walletId) return;
    setIsLoading(true);
    setError(null);
    setTickets([]); // Clear previous tickets
    try {
      const response = await fetch(`${API_BASE_URL}/wallets/${walletId}/tickets`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setTickets(data);
    } catch (e) {
      console.error(`Failed to fetch tickets for wallet ${walletId}:`, e);
      setError('Could not load tickets for this wallet.');
    } finally {
      setIsLoading(false);
    }
  };

  // Consume a ticket
  const consumeTicket = async (ticketId) => {
    // Optimistic UI update: remove ticket immediately
    const originalTickets = [...tickets];
    setTickets(currentTickets => currentTickets.filter(t => t.id !== ticketId));

    try {
      const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}/consume`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      // Success: Ticket is already removed from local state
      console.log(`Ticket ${ticketId} consumed successfully.`);
      // Optionally: show a success message
    } catch (e) {
      console.error(`Failed to consume ticket ${ticketId}:`, e);
      setError(`Failed to consume ticket: ${e.message}`);
      // Rollback optimistic update on failure
      setTickets(originalTickets);
    }
  };

  // Initial fetch of wallets on mount
  useEffect(() => {
    fetchWallets();
  }, []);

  // Handle selecting a wallet
  const handleSelectWallet = (wallet) => {
    setSelectedWallet(wallet);
    fetchTickets(wallet.id);
    setView(VIEW_ENUM.DETAIL);
  };

  // Handle going back to wallet list
  const handleBackToWallets = () => {
    setSelectedWallet(null);
    setTickets([]);
    setView(VIEW_ENUM.WALLETS);
  };

  // Handle navigation
  const navigateTo = (targetView) => {
    setView(targetView);
    // Clear wallet selection if navigating away from detail
    if (targetView !== VIEW_ENUM.DETAIL) {
      setSelectedWallet(null);
      setTickets([]);
    }
    // Fetch wallets if navigating back to the main list and it's empty
    if (targetView === VIEW_ENUM.WALLETS && wallets.length === 0) {
      fetchWallets();
    }
  };

  return (
    <div className={styles.appContainer}>
      <header className={styles.header}>
        <h1>Impulse Ticket Manager</h1>
        <nav>
          <button
            onClick={() => navigateTo(VIEW_ENUM.WALLETS)}
            disabled={view === VIEW_ENUM.WALLETS}
          >
            Wallets
          </button>
          <button
            onClick={() => navigateTo(VIEW_ENUM.TICKET_TYPES)}
            disabled={view === VIEW_ENUM.TICKET_TYPES}
          >
            Manage Ticket Types
          </button>
        </nav>
      </header>

      <main className={styles.mainContent}>
        {isLoading && <div className={styles.loading}>Loading...</div>}
        {error && <div className={styles.error}>Error: {error} <button onClick={() => setError(null)}>Dismiss</button></div>}

        {view === VIEW_ENUM.WALLETS && !selectedWallet && (
          <WalletList
            wallets={wallets}
            onSelectWallet={handleSelectWallet}
            onRefresh={fetchWallets}
            apiBaseUrl={API_BASE_URL}
            setWallets={setWallets}
          />
        )}

        {view === VIEW_ENUM.DETAIL && selectedWallet && (
          <WalletView
            wallet={selectedWallet}
            tickets={tickets}
            onConsumeTicket={consumeTicket}
            onBack={handleBackToWallets}
            isLoading={isLoading}
          />
        )}

        {view === VIEW_ENUM.TICKET_TYPES && (
          <TicketTypeManager
            apiBaseUrl={API_BASE_URL}
            wallets={wallets}
            onTicketTypesUpdated={() => { }} // Callback if needed
          />
        )}
      </main>

      <footer className={styles.footer}>
        A simple tool inspired by cards.
      </footer>
    </div>
  );
}

export default App;