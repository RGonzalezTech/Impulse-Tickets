import React from 'react';
import { motion } from 'framer-motion';
import styles from './TicketCard.module.css';

// Forwarding ref is necessary for framer-motion's layout animations
const TicketCard = React.forwardRef(({ ticket, onConsume, style, ...motionProps }, ref) => {
    const handleConsumeClick = (e) => {
        e.stopPropagation(); // Prevent triggering any parent onClick if needed
        onConsume();
    };

    // Format date for display
    const formatDate = (isoString) => {
        if (!isoString) return 'N/A';
        try {
            return new Date(isoString).toLocaleDateString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric'
            });
        } catch (e) {
            console.error("Error formatting date:", isoString, e);
            return "Invalid Date";
        }
    };


    return (
        <motion.div
            ref={ref} // Attach the ref here
            className={styles.ticketCard}
            style={style} // Pass style for positioning/rotation from parent
            whileHover={{ scale: 1.1, y: (style?.y || 0) - 10, zIndex: 100 }} // Lift card on hover
            whileTap={{ scale: 0.95 }}
            {...motionProps} // Spread the rest of the framer-motion props (animate, initial, exit, etc.)
        >
            <div className={styles.cardContent}>
                <h4 className={styles.ticketName}>{ticket.ticket_type_name}</h4>
                <p className={styles.ticketInfo}>Issued: {formatDate(ticket.issued_date)}</p>
                <p className={styles.ticketId}>ID: {ticket.id}</p>
            </div>
            <button
                className={styles.consumeButton}
                onClick={handleConsumeClick}
                aria-label={`Consume ticket ${ticket.ticket_type_name}`}
            >
                Consume
            </button>
        </motion.div>
    );
});

export default TicketCard;