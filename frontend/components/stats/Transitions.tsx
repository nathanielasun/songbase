'use client';

import React, {
  ReactNode,
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
  Children,
  cloneElement,
  isValidElement,
  CSSProperties,
  ElementType,
} from 'react';

/**
 * Animation configuration
 */
export interface AnimationConfig {
  duration?: number;
  delay?: number;
  easing?: string;
  disabled?: boolean;
}

const defaultConfig: AnimationConfig = {
  duration: 300,
  delay: 0,
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  disabled: false,
};

/**
 * Context for reduced motion preference
 */
const ReducedMotionContext = createContext(false);

export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handler = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return prefersReducedMotion;
}

/**
 * Provider that respects user's reduced motion preference
 */
export function ReducedMotionProvider({ children }: { children: ReactNode }) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <ReducedMotionContext.Provider value={prefersReducedMotion}>
      {children}
    </ReducedMotionContext.Provider>
  );
}

export function useAnimationContext(): boolean {
  return useContext(ReducedMotionContext);
}

/**
 * FadeIn - Simple fade in animation
 */
interface FadeInProps {
  children: ReactNode;
  duration?: number;
  delay?: number;
  className?: string;
  as?: ElementType;
}

export function FadeIn({
  children,
  duration = 300,
  delay = 0,
  className = '',
  as: Component = 'div',
}: FadeInProps) {
  const [isVisible, setIsVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (prefersReducedMotion) {
    return <Component className={className}>{children}</Component>;
  }

  return (
    <Component
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transition: `opacity ${duration}ms ease-out`,
      }}
    >
      {children}
    </Component>
  );
}

/**
 * SlideIn - Slide in from a direction
 */
interface SlideInProps {
  children: ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right';
  duration?: number;
  delay?: number;
  distance?: number;
  className?: string;
}

export function SlideIn({
  children,
  direction = 'up',
  duration = 300,
  delay = 0,
  distance = 20,
  className = '',
}: SlideInProps) {
  const [isVisible, setIsVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  const getTransform = () => {
    if (isVisible) return 'translate(0, 0)';

    switch (direction) {
      case 'up':
        return `translateY(${distance}px)`;
      case 'down':
        return `translateY(-${distance}px)`;
      case 'left':
        return `translateX(${distance}px)`;
      case 'right':
        return `translateX(-${distance}px)`;
    }
  };

  return (
    <div
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: getTransform(),
        transition: `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * ScaleIn - Scale in animation
 */
interface ScaleInProps {
  children: ReactNode;
  duration?: number;
  delay?: number;
  initialScale?: number;
  className?: string;
}

export function ScaleIn({
  children,
  duration = 300,
  delay = 0,
  initialScale = 0.95,
  className = '',
}: ScaleInProps) {
  const [isVisible, setIsVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={className}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'scale(1)' : `scale(${initialScale})`,
        transition: `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Stagger - Stagger animations for list items
 */
interface StaggerProps {
  children: ReactNode;
  staggerDelay?: number;
  initialDelay?: number;
  animation?: 'fade' | 'slide' | 'scale';
  direction?: 'up' | 'down' | 'left' | 'right';
  className?: string;
}

export function Stagger({
  children,
  staggerDelay = 50,
  initialDelay = 0,
  animation = 'fade',
  direction = 'up',
  className = '',
}: StaggerProps) {
  const prefersReducedMotion = useReducedMotion();
  const childrenArray = Children.toArray(children);

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={className}>
      {childrenArray.map((child, index) => {
        const delay = initialDelay + index * staggerDelay;

        switch (animation) {
          case 'slide':
            return (
              <SlideIn key={index} delay={delay} direction={direction}>
                {child}
              </SlideIn>
            );
          case 'scale':
            return (
              <ScaleIn key={index} delay={delay}>
                {child}
              </ScaleIn>
            );
          default:
            return (
              <FadeIn key={index} delay={delay}>
                {child}
              </FadeIn>
            );
        }
      })}
    </div>
  );
}

/**
 * Collapse - Height animation for expandable content
 */
interface CollapseProps {
  isOpen: boolean;
  children: ReactNode;
  duration?: number;
  className?: string;
}

export function Collapse({ isOpen, children, duration = 300, className = '' }: CollapseProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>(isOpen ? 'auto' : 0);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (contentRef.current) {
      if (isOpen) {
        const contentHeight = contentRef.current.scrollHeight;
        setHeight(contentHeight);
        // After animation, set to auto for dynamic content
        const timer = setTimeout(() => setHeight('auto'), duration);
        return () => clearTimeout(timer);
      } else {
        // First set explicit height for animation
        const contentHeight = contentRef.current.scrollHeight;
        setHeight(contentHeight);
        // Then trigger collapse
        requestAnimationFrame(() => {
          setHeight(0);
        });
      }
    }
  }, [isOpen, duration]);

  if (prefersReducedMotion) {
    return isOpen ? <div className={className}>{children}</div> : null;
  }

  return (
    <div
      style={{
        height: typeof height === 'number' ? `${height}px` : height,
        overflow: 'hidden',
        transition: `height ${duration}ms ease-out`,
      }}
      className={className}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

/**
 * TabTransition - Smooth transition between tab content
 */
interface TabTransitionProps {
  activeKey: string | number;
  children: ReactNode;
  duration?: number;
  className?: string;
}

export function TabTransition({
  activeKey,
  children,
  duration = 200,
  className = '',
}: TabTransitionProps) {
  const [displayKey, setDisplayKey] = useState(activeKey);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (activeKey !== displayKey) {
      if (prefersReducedMotion) {
        setDisplayKey(activeKey);
        return;
      }

      setIsTransitioning(true);
      const timer = setTimeout(() => {
        setDisplayKey(activeKey);
        setIsTransitioning(false);
      }, duration / 2);

      return () => clearTimeout(timer);
    }
  }, [activeKey, displayKey, duration, prefersReducedMotion]);

  // Find the child with matching key
  const activeChild = Children.toArray(children).find((child) => {
    if (isValidElement(child)) {
      const props = child.props as Record<string, unknown>;
      return child.key === displayKey || props.tabKey === displayKey;
    }
    return false;
  });

  if (prefersReducedMotion) {
    return <div className={className}>{activeChild}</div>;
  }

  return (
    <div
      className={className}
      style={{
        opacity: isTransitioning ? 0 : 1,
        transform: isTransitioning ? 'translateY(10px)' : 'translateY(0)',
        transition: `opacity ${duration / 2}ms ease-out, transform ${duration / 2}ms ease-out`,
      }}
    >
      {activeChild}
    </div>
  );
}

/**
 * AnimatedPresence - Mount/unmount with animations
 */
interface AnimatedPresenceProps {
  isVisible: boolean;
  children: ReactNode;
  duration?: number;
  animation?: 'fade' | 'scale' | 'slide';
  className?: string;
}

export function AnimatedPresence({
  isVisible,
  children,
  duration = 200,
  animation = 'fade',
  className = '',
}: AnimatedPresenceProps) {
  const [shouldRender, setShouldRender] = useState(isVisible);
  const [animationState, setAnimationState] = useState<'entering' | 'entered' | 'exiting'>(
    isVisible ? 'entered' : 'exiting'
  );
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
      requestAnimationFrame(() => setAnimationState('entering'));
      const timer = setTimeout(() => setAnimationState('entered'), duration);
      return () => clearTimeout(timer);
    } else {
      setAnimationState('exiting');
      const timer = setTimeout(() => setShouldRender(false), duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration]);

  if (!shouldRender) return null;

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  const getAnimationStyles = (): CSSProperties => {
    const isEntered = animationState === 'entered' || animationState === 'entering';
    const baseTransition = `all ${duration}ms ease-out`;

    switch (animation) {
      case 'scale':
        return {
          opacity: isEntered ? 1 : 0,
          transform: isEntered ? 'scale(1)' : 'scale(0.95)',
          transition: baseTransition,
        };
      case 'slide':
        return {
          opacity: isEntered ? 1 : 0,
          transform: isEntered ? 'translateY(0)' : 'translateY(10px)',
          transition: baseTransition,
        };
      default:
        return {
          opacity: isEntered ? 1 : 0,
          transition: baseTransition,
        };
    }
  };

  return (
    <div className={className} style={getAnimationStyles()}>
      {children}
    </div>
  );
}

/**
 * NumberTransition - Animated number counter
 */
interface NumberTransitionProps {
  value: number;
  duration?: number;
  formatValue?: (value: number) => string;
  className?: string;
}

export function NumberTransition({
  value,
  duration = 500,
  formatValue = (v) => v.toLocaleString(),
  className = '',
}: NumberTransitionProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const animationRef = useRef<number | null>(null);
  const startValueRef = useRef(value);
  const startTimeRef = useRef<number | null>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayValue(value);
      return;
    }

    const startValue = startValueRef.current;
    const diff = value - startValue;

    if (diff === 0) return;

    const animate = (currentTime: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = currentTime;
      }

      const elapsed = currentTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);

      const currentValue = startValue + diff * easeOut;
      setDisplayValue(Math.round(currentValue));

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        startValueRef.current = value;
        startTimeRef.current = null;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration, prefersReducedMotion]);

  return <span className={className}>{formatValue(displayValue)}</span>;
}

/**
 * Pulse - Pulse animation effect
 */
interface PulseProps {
  children: ReactNode;
  active?: boolean;
  color?: string;
  className?: string;
}

export function Pulse({ children, active = true, color = 'pink', className = '' }: PulseProps) {
  const prefersReducedMotion = useReducedMotion();

  if (!active || prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  const colorClasses: Record<string, string> = {
    pink: 'shadow-pink-500/50',
    purple: 'shadow-purple-500/50',
    green: 'shadow-green-500/50',
    blue: 'shadow-blue-500/50',
    amber: 'shadow-amber-500/50',
  };

  return (
    <div
      className={`animate-pulse-glow ${colorClasses[color] || colorClasses.pink} ${className}`}
      style={{
        animation: 'pulse-glow 2s ease-in-out infinite',
      }}
    >
      {children}
    </div>
  );
}

/**
 * CSS for animations (should be added to global styles or use Tailwind config)
 */
export const ANIMATION_STYLES = `
@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 0 0 0 currentColor;
  }
  50% {
    box-shadow: 0 0 20px 5px currentColor;
  }
}

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.animate-shimmer {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.1) 50%,
    rgba(255, 255, 255, 0) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.animate-float {
  animation: float 3s ease-in-out infinite;
}
`;

/**
 * Hook to detect when element is in viewport
 */
export function useInView(
  ref: React.RefObject<HTMLElement | null>,
  options?: IntersectionObserverInit
): boolean {
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
        observer.disconnect();
      }
    }, options);

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, [ref, options]);

  return isInView;
}

/**
 * AnimateOnView - Animate when element comes into view
 */
interface AnimateOnViewProps {
  children: ReactNode;
  animation?: 'fade' | 'slide' | 'scale';
  direction?: 'up' | 'down' | 'left' | 'right';
  duration?: number;
  delay?: number;
  threshold?: number;
  className?: string;
}

export function AnimateOnView({
  children,
  animation = 'fade',
  direction = 'up',
  duration = 300,
  delay = 0,
  threshold = 0.1,
  className = '',
}: AnimateOnViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { threshold });
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    );
  }

  const AnimationComponent =
    animation === 'slide' ? SlideIn : animation === 'scale' ? ScaleIn : FadeIn;

  return (
    <div ref={ref} className={className}>
      {isInView ? (
        <AnimationComponent duration={duration} delay={delay} direction={direction}>
          {children}
        </AnimationComponent>
      ) : (
        <div style={{ opacity: 0 }}>{children}</div>
      )}
    </div>
  );
}
