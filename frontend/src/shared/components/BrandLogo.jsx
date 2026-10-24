/** Shared branding for headers, authentication screens, and loading states. */
export default function BrandLogo({ className = 'h-10 w-auto', compact = false }) {
  return (
    <img
      src={compact ? '/logo-mark.png' : '/logo.png'}
      alt="Spinzyt"
      className={`shrink-0 object-contain ${className}`}
      draggable={false}
    />
  );
}
