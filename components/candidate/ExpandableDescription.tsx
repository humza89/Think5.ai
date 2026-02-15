"use client";

import { useState } from "react";

export default function ExpandableDescription({ description, maxLength = 150 }: { description: string; maxLength?: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!description) return null;

  const shouldTruncate = description.length > maxLength;
  const displayText = isExpanded || !shouldTruncate
    ? description
    : description.slice(0, maxLength) + '...';

  return (
    <div className="text-sm mt-2 text-gray-700 leading-relaxed">
      <span className="whitespace-pre-line">{displayText}</span>
      {shouldTruncate && (
        <>
          {' '}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-blue-600 hover:text-blue-700 font-medium inline-flex items-center"
          >
            {isExpanded ? 'see less' : 'see more'}
          </button>
        </>
      )}
    </div>
  );
}
