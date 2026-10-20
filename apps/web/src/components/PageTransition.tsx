import { AnimatePresence, LazyMotion, domAnimation, m } from "motion/react";
import { useLocation, useOutlet } from "react-router-dom";

export function PageTransition() {
  const { pathname } = useLocation();
  const outlet = useOutlet();

  return (
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence mode="wait" initial={false} onExitComplete={() => window.scrollTo(0, 0)}>
        <m.div
          key={pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.12, ease: "easeIn" } }}
        >
          {outlet}
        </m.div>
      </AnimatePresence>
    </LazyMotion>
  );
}
