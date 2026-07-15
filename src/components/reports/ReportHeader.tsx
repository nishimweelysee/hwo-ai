"use client";

import { useState } from "react";

export function ReportHeader() {
  const [imageError, setImageError] = useState(false);

  if (imageError) {
    return (
      <div className="mb-6 border-b border-slate-200 pb-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3">
          <div>
            <p className="text-lg font-bold text-orange-600">AfriYAN</p>
            <p className="text-xs text-slate-600">
              African Youth and Adolescents Network on Population and Development
            </p>
          </div>
          <div className="text-right">
            <p className="text-base font-semibold text-teal-800">AfriYAN Rwanda</p>
            <p className="text-xs text-teal-700">Office: 1 KN 78 St, Kigali | Norrsken House Kigali</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 border-b border-slate-200 pb-4">
      {/* Native img — avoids Next.js image optimizer failing on this PNG */}
      <img
        src="/images/report-header.png"
        alt="AfriYAN Rwanda"
        width={900}
        height={120}
        className="h-auto w-full max-h-28 object-contain object-left"
        onError={() => setImageError(true)}
      />
    </div>
  );
}
