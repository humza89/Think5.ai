"use client";

export default function CompanyLogo({
  src,
  alt,
  className = "h-12 w-12 rounded border object-contain bg-white"
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={(e) => {
        const target = e.target as HTMLImageElement;
        // Try a gray placeholder instead
        target.style.display = 'none';
        if (target.nextElementSibling) {
          (target.nextElementSibling as HTMLElement).style.display = 'flex';
        }
      }}
    />
  );
}
