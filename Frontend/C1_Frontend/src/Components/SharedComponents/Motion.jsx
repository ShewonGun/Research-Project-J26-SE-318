import { AnimatePresence, motion } from "motion/react";
import { useLocation } from "react-router-dom";

// Fades/slides routed content on navigation. Wrap <Outlet/> with this inside a
// layout. Keyed by pathname so each route enters and exits.
export const PageFade = ({ children }) => {
    const location = useLocation();
    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
            >
                {children}
            </motion.div>
        </AnimatePresence>
    );
};

// Staggered entrance for a group of cards/tiles. Use <StaggerGrid> in place of a
// grid/flex wrapper and wrap each child in <StaggerItem>.
const containerVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } },
};

export const StaggerGrid = ({ className, children }) => (
    <motion.div className={className} variants={containerVariants} initial="hidden" animate="show">
        {children}
    </motion.div>
);

export const StaggerItem = ({ className, children }) => (
    <motion.div className={className} variants={itemVariants}>
        {children}
    </motion.div>
);
