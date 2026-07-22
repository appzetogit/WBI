import React from 'react';
import { motion } from 'framer-motion';

const pageVariants = {
  initial: { opacity: 1 },
  animate: { opacity: 1, transition: { duration: 0.12, ease: 'easeOut' } },
  exit: { opacity: 1, transition: { duration: 0.08, ease: 'easeIn' } }
};

/**
 * Page wrapper without opacity:0 entry — AnimatePresence+opacity:0 caused
 * production blank screens when exit/enter got stuck.
 */
const AnimatedPage = ({ children, className = '' }) => {
  return (
    <motion.div
      initial={false}
      animate="animate"
      variants={pageVariants}
      className={className || undefined}
      style={{ minHeight: '100%' }}
    >
      {children}
    </motion.div>
  );
};

export default AnimatedPage;
