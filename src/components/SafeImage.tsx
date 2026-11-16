import { useState } from 'react';
import { Compass } from 'lucide-react';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
}

export function SafeImage({
  src,
  alt,
  className = '',
  fallbackLabel = 'Bản vẽ kỹ thuật SIS',
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-[#F5F7FA] text-[#142C48]/60 p-6 text-center ${className}`}
        role="img"
        aria-label={alt}
      >
        <Compass className="w-9 h-9 mb-2 text-[#142C48]/40" />
        <span className="text-xs font-medium text-[#142C48]/70 line-clamp-2">
          {fallbackLabel}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
