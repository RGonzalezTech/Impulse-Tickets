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

  // --- Fetch Wallets ---
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

  // --- Fetch Tickets ---
  const fetchTickets = async (walletId) => {
    if (!walletId) return;
    setIsLoading(true);
    setError(null);
    setTickets([]);
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

  // --- Consume Ticket ---
  const consumeTicket = async (ticketId) => {
    const originalTickets = [...tickets];
    setTickets(currentTickets => currentTickets.filter(t => t.id !== ticketId));
    setError(null); // Clear previous errors

    try {
      const response = await fetch(`${API_BASE_URL}/tickets/${ticketId}/consume`, {
        method: 'POST',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      console.log(`Ticket ${ticketId} consumed successfully.`);
    } catch (e) {
      console.error(`Failed to consume ticket ${ticketId}:`, e);
      setError(`Failed to consume ticket: ${e.message}`);
      setTickets(originalTickets); // Rollback
    }
  };

  // --- Delete Wallet ---
  const handleDeleteWallet = async (walletId) => {
    console.log(`Attempting to delete wallet ID: ${walletId}`);
    setError(null);

    // Find the wallet name *before* deleting for confirmation/messages
    const walletToDelete = wallets.find(w => w.id === walletId);
    const walletName = walletToDelete ? walletToDelete.name : `ID ${walletId}`;

    try {
      const response = await fetch(`${API_BASE_URL}/wallets/${walletId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
        } catch (parseError) {
          console.error("Could not parse error response:", parseError);
        }
        throw new Error(errorMsg);
      }

      console.log(`Wallet ${walletName} deleted successfully.`);
      // Update local state
      setWallets(currentWallets => currentWallets.filter(w => w.id !== walletId));
      // If the deleted wallet was selected, go back to the list
      if (selectedWallet && selectedWallet.id === walletId) {
      handleBackToWallets();
      }

    } catch (e) {
      console.error(`Failed to delete wallet ${walletName}:`, e);
      setError(`Failed to delete wallet: ${e.message}`);
    }
  };

  const handleUpdateWallet = async (walletId, newName) => {
    console.log(`Attempting to update wallet ID: ${walletId} to name: ${newName}`);
    setError(null); // Clear previous global errors

    // Optimistic UI update (optional but can feel faster)
    const originalWallets = [...wallets];
    const originalSelectedWallet = selectedWallet ? { ...selectedWallet } : null;

    // Update state locally first
    setWallets(currentWallets =>
        currentWallets.map(w =>
            w.id === walletId ? { ...w, name: newName } : w
        )
    );
    if (selectedWallet && selectedWallet.id === walletId) {
        setSelectedWallet(currentSelected => ({ ...currentSelected, name: newName }));
    }

    try {
        const response = await fetch(`${API_BASE_URL}/wallets/${walletId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: newName }),
        });

        const data = await response.json(); // Get the updated wallet data or error

        if (!response.ok) {
            // Use error from API response if available
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        console.log(`Wallet ${walletId} updated successfully.`);
        // API confirmed the update, local state is already updated (if optimistic)
        // If not using optimistic update, update state here:
        // setWallets(currentWallets => currentWallets.map(w => w.id === walletId ? data : w));
        // if (selectedWallet && selectedWallet.id === walletId) {
        //     setSelectedWallet(data);
        // }

        // No need to return anything specific, but throwing error signals failure
    } catch (e) {
        console.error(`Failed to update wallet ${walletId}:`, e);
        setError(`Failed to update wallet: ${e.message}`); // Show error globally

        // Rollback optimistic update on failure
        setWallets(originalWallets);
        if (originalSelectedWallet && selectedWallet && selectedWallet.id === originalSelectedWallet.id) {
            setSelectedWallet(originalSelectedWallet);
        }

        // Re-throw the error so WalletView knows it failed
        throw e;
    }
  };


  // --- Initial Fetch ---
  useEffect(() => {
    fetchWallets();
  }, []);

  // --- Navigation Handlers ---
  const handleSelectWallet = (wallet) => {
    setSelectedWallet(wallet);
    fetchTickets(wallet.id);
    setView(VIEW_ENUM.DETAIL);
    setError(null); // Clear errors when navigating
  };

  const handleBackToWallets = () => {
    setSelectedWallet(null);
    setTickets([]);
    setView(VIEW_ENUM.WALLETS);
    setError(null);
  };

  const navigateTo = (targetView) => {
    setView(targetView);
    if (targetView !== VIEW_ENUM.DETAIL) {
      setSelectedWallet(null);
      setTickets([]);
    }
    if (targetView === VIEW_ENUM.WALLETS && wallets.length === 0) {
      fetchWallets(); // Refetch if navigating back and list is empty
    }
     setError(null); // Clear errors on navigation
  };

  // --- Render Logic ---
  return (
    <div className={styles.appContainer}>
      <header className={styles.header}>
        <h1>Impulse Ticket Manager</h1>
        <nav>
          <button
            onClick={() => navigateTo(VIEW_ENUM.WALLETS)}
            disabled={view === VIEW_ENUM.WALLETS}
            className={styles.navButton} // Add styles as needed
          >
            Wallets
          </button>
          <button
            onClick={() => navigateTo(VIEW_ENUM.TICKET_TYPES)}
            disabled={view === VIEW_ENUM.TICKET_TYPES}
            className={styles.navButton} // Add styles as needed
          >
            Manage Ticket Types
          </button>
        </nav>
      </header>

      <main className={styles.mainContent}>
        {/* Global Loading/Error Display */}
        {isLoading && <div className={styles.loading}>Loading...</div>}
        {error && <div className={styles.error}>Error: {error} <button onClick={() => setError(null)}>Dismiss</button></div>}

        {/* Conditional View Rendering */}
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
            onDeleteWallet={handleDeleteWallet}
            onUpdateWallet={handleUpdateWallet} // Pass the new handler
            onBack={handleBackToWallets}
            isLoading={isLoading && tickets.length === 0} // Show loading only if tickets are loading
            apiBaseUrl={API_BASE_URL} // Pass if needed
          />
        )}

        {view === VIEW_ENUM.TICKET_TYPES && (
          <TicketTypeManager
            apiBaseUrl={API_BASE_URL}
            wallets={wallets} // Pass wallets for the dropdown
            onTicketTypesUpdated={fetchWallets} // Optional: Refresh wallets if needed after TT changes
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
