// AquaFlow mark: a water droplet filled with the brand cyan→blue gradient
// (no background tile). Uses an inline SVG gradient since CSS gradients can't
// fill an icon.
const Logo = ({ className = "h-7 w-7" }) => (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
        <defs>
            <linearGradient id="aqua-logo" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#06b6d4" />
                <stop offset="1" stopColor="#2563eb" />
            </linearGradient>
        </defs>
        <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" fill="url(#aqua-logo)" />
    </svg>
);

export default Logo;
