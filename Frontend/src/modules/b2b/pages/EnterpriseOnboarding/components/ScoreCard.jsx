import React from 'react';
import { FiAward, FiShield, FiTrendingUp } from 'react-icons/fi';

export default function ScoreCard({ onboarding, documents = [] }) {
  const scores = onboarding?.scores || {};
  const profileScore = scores.profileScore ?? 0;
  const riskScore = scores.riskScore ?? 0;
  const riskTier = scores.riskTier || 'standard';

  // Calculate quick stats
  const docsVerified = documents.filter((d) => d.status === 'verified').length;
  const totalDocs = Math.max(documents.length, 1);
  const docPercent = Math.round((docsVerified / totalDocs) * 100);

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-teal-950 rounded-2xl p-5 text-white shadow-xl relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-[#10AFA5]/10 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="text-[10px] uppercase font-bold tracking-widest text-[#10AFA5] bg-[#10AFA5]/20 px-2 py-0.5 rounded-full">
            Enterprise Readiness
          </span>
          <h3 className="text-base font-bold text-white mt-1">Profile Health & Scores</h3>
        </div>
        <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-[#10AFA5]">
          <FiAward className="w-5 h-5" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Profile Score */}
        <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3 border border-white/10">
          <div className="flex items-center justify-between text-slate-300 text-xs mb-1">
            <span>Readiness</span>
            <FiTrendingUp className="w-3.5 h-3.5 text-[#10AFA5]" />
          </div>
          <div className="text-2xl font-black text-white">{profileScore}%</div>
          <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-[#10AFA5] h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(profileScore, 100)}%` }}
            />
          </div>
        </div>

        {/* Risk Tier */}
        <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3 border border-white/10">
          <div className="flex items-center justify-between text-slate-300 text-xs mb-1">
            <span>Risk Tier</span>
            <FiShield className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-black text-white capitalize">{riskTier}</div>
          <div className="text-[10px] text-slate-400 mt-2">Score: {riskScore}/100</div>
        </div>

        {/* Verified Documents */}
        <div className="bg-white/5 backdrop-blur-xs rounded-xl p-3 border border-white/10">
          <div className="flex items-center justify-between text-slate-300 text-xs mb-1">
            <span>Verified Docs</span>
            <span className="text-emerald-400 text-xs font-bold">{docPercent}%</span>
          </div>
          <div className="text-2xl font-black text-white">
            {docsVerified}
            <span className="text-xs font-normal text-slate-400">/{totalDocs}</span>
          </div>
          <div className="w-full bg-white/10 h-1.5 rounded-full mt-2 overflow-hidden">
            <div
              className="bg-emerald-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(docPercent, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
