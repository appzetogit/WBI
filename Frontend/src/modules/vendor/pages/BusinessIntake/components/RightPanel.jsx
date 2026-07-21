import React, { useEffect, useMemo, useState } from 'react';
import {
  FilePlus,
  Send,
  Upload,
  Bell,
  CheckCircle2,
  Clock,
  FileText,
} from 'lucide-react';
import { RightRail } from '../../../components/enterprise';
import { useVendorConfig } from '../../../context/VendorConfigContext';
import useVendorBasePath from '../../../hooks/useVendorBasePath';
import { fetchActivityFeed } from '../../../services/businessIntakeService';
import { useBusinessIntake } from '../context/BusinessIntakeContext';

const COLOR_MAP = {
  blue: 'bg-blue-100 text-blue-600',
  green: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
  violet: 'bg-violet-100 text-violet-600',
};

const ICON_MAP = {
  opportunity: Bell,
  bid: Clock,
  award: CheckCircle2,
  proposal: FileText,
};

const RightPanel = () => {
  const { vendorProfile, pendingOpportunitiesCount = 0 } = useVendorConfig() || {};
  const { basePath } = useVendorBasePath();
  const { openProposalBuilder, refreshKey } = useBusinessIntake();
  const [activity, setActivity] = useState([]);

  const kycStatus = vendorProfile?.complianceStatus?.kycStatus || vendorProfile?.kycStatus;
  const kycProgress = kycStatus === 'verified' ? 100 : kycStatus === 'pending' ? 75 : 45;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchActivityFeed({ limit: 8 });
        if (!cancelled && res.data?.success) {
          setActivity(res.data.data || []);
        }
      } catch {
        if (!cancelled) setActivity([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const quickActions = useMemo(
    () => [
      {
        icon: FilePlus,
        label: 'Create Proposal',
        onClick: () => openProposalBuilder({}),
      },
      { icon: Send, label: 'Submit Quote', path: `${basePath}/business-intake/rfq` },
      { icon: Upload, label: 'Upload Document', path: `${basePath}/compliance` },
    ],
    [basePath, openProposalBuilder]
  );

  const feedItems = useMemo(() => {
    const items = (activity || []).map((ev) => ({
      id: ev.id,
      icon: ICON_MAP[ev.type] || Bell,
      color: COLOR_MAP[ev.colorKey] || COLOR_MAP.blue,
      text: ev.text,
      time: ev.time,
    }));
    if (pendingOpportunitiesCount > 0) {
      items.unshift({
        id: 'pending-live',
        icon: Bell,
        color: COLOR_MAP.violet,
        text: `${pendingOpportunitiesCount} open opportunities match your services`,
        time: 'Live',
      });
    }
    return items.slice(0, 8);
  }, [activity, pendingOpportunitiesCount]);

  const tip = {
    title: 'Complete your profile',
    description: 'Vendors with verified KYC receive 3× more opportunity matches.',
    progress: kycProgress,
    progressLabel: 'KYC Progress',
    ctaPath: `${basePath}/compliance`,
    ctaLabel: 'Complete Now',
  };

  return <RightRail quickActions={quickActions} activity={feedItems} tip={tip} />;
};

export default RightPanel;
