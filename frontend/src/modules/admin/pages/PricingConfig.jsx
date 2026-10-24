import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Truck, 
  Zap, 
  Save, 
  RefreshCw, 
  AlertCircle, 
  TrendingUp, 
  Clock, 
  Info, 
  ShieldCheck,
  Gem,
  Award,
  Layers,
  Sparkles,
  ChevronRight,
  CreditCard
} from 'lucide-react';
import PageHeader from '../components/common/PageHeader';
import MetricRow from '../components/cards/MetricRow';
import { shippingConfigApi } from '@/lib/shippingApi';
import toast from 'react-hot-toast';

export default function PricingConfig() {
  const [searchParams] = useSearchParams();
  const [configs, setConfigs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Form states
  const [expressSurcharge, setExpressSurcharge] = useState(99);
  const [normalLogisticsFee, setNormalLogisticsFee] = useState(50);
  const [essentialFee, setEssentialFee] = useState(20);
  const [heritageFee, setHeritageFee] = useState(150);
  const [freeDeliveryThreshold, setFreeDeliveryThreshold] = useState(500);
  
  // Global Multipliers
  const [basePriceMultiplier, setBasePriceMultiplier] = useState(1.0);
  const [isBaseActive, setIsBaseActive] = useState(false);
  const [discountedPriceMultiplier, setDiscountedPriceMultiplier] = useState(1.0);
  const [isDiscountedActive, setIsDiscountedActive] = useState(false);
  const [gstPercentage, setGstPercentage] = useState(18);
  const [advancePercentage, setAdvancePercentage] = useState(100);
  const [deliveryDay, setDeliveryDay] = useState('Sunday');
  const [platformFeeMultiplier, setPlatformFeeMultiplier] = useState(1.0);

  // Refs for auto-scrolling
  const sectionRefs = {
    express: useRef(null),
    essential: useRef(null),
    heritage: useRef(null),
    rates: useRef(null)
  };

  const fetchData = async () => {
    try {
      setIsLoading(true);
      const data = await shippingConfigApi.getConfig();
      setConfigs(data);
      
      const surcharge = data.find(c => c.key === 'express_surcharge');
      if (surcharge) setExpressSurcharge(surcharge.value);

      const normalFee = data.find(c => c.key === 'normal_logistics_fee');
      if (normalFee) setNormalLogisticsFee(normalFee.value);

      const eFee = data.find(c => c.key === 'essential_fee');
      if (eFee) setEssentialFee(eFee.value);

      const hFee = data.find(c => c.key === 'heritage_fee');
      if (hFee) setHeritageFee(hFee.value);

      const threshold = data.find(c => c.key === 'free_delivery_threshold');
      if (threshold) setFreeDeliveryThreshold(threshold.value);

      const bMult = data.find(c => c.key === 'global_base_price_multiplier');
      if (bMult) setBasePriceMultiplier(bMult.value);
      const bActive = data.find(c => c.key === 'is_global_base_multiplier_active');
      if (bActive) setIsBaseActive(bActive.value === true || bActive.value === 'true');

      const dMult = data.find(c => c.key === 'global_discounted_price_multiplier');
      if (dMult) setDiscountedPriceMultiplier(dMult.value);
      const dActive = data.find(c => c.key === 'is_global_discounted_multiplier_active');
      if (dActive) setIsDiscountedActive(dActive.value === true || dActive.value === 'true');

      const gst = data.find(c => c.key === 'gst_percent');
      if (gst) setGstPercentage(gst.value);

      const advance = data.find(c => c.key === 'advance_percentage');
      if (advance) setAdvancePercentage(advance.value);

      const dDay = data.find(c => c.key === 'delivery_day');
      if (dDay) setDeliveryDay(dDay.value);

      const pMult = data.find(c => c.key === 'platform_fee_multiplier');
      if (pMult) setPlatformFeeMultiplier(pMult.value);
    } catch (err) {
      toast.error('Failed to load system configuration');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const type = searchParams.get('type');
    if (type && sectionRefs[type]?.current) {
        sectionRefs[type].current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        sectionRefs[type].current.classList.add('ring-4', 'ring-primary/20');
        setTimeout(() => {
            sectionRefs[type].current.classList.remove('ring-4', 'ring-primary/20');
        }, 3000);
    }
  }, [searchParams, isLoading]);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await Promise.all([
        shippingConfigApi.updateConfig('express_surcharge', Number(expressSurcharge)),
        shippingConfigApi.updateConfig('normal_logistics_fee', Number(normalLogisticsFee)),
        shippingConfigApi.updateConfig('essential_fee', Number(essentialFee)),
        shippingConfigApi.updateConfig('heritage_fee', Number(heritageFee)),
        shippingConfigApi.updateConfig('free_delivery_threshold', Number(freeDeliveryThreshold)),
        shippingConfigApi.updateConfig('global_base_price_multiplier', Number(basePriceMultiplier)),
        shippingConfigApi.updateConfig('is_global_base_multiplier_active', isBaseActive),
        shippingConfigApi.updateConfig('global_discounted_price_multiplier', Number(discountedPriceMultiplier)),
        shippingConfigApi.updateConfig('is_global_discounted_multiplier_active', isDiscountedActive),
        shippingConfigApi.updateConfig('gst_percent', Number(gstPercentage)),
        shippingConfigApi.updateConfig('advance_percentage', Number(advancePercentage)),
        shippingConfigApi.updateConfig('delivery_day', deliveryDay),
        shippingConfigApi.updateConfig('platform_fee_multiplier', Number(platformFeeMultiplier))
      ]);
      toast.success('Pricing policies updated successfully');
      fetchData();
    } catch (err) {
      toast.error('Failed to update policies');
    } finally {
      setIsSaving(false);
    }
  };

  const stats = useMemo(() => [
    { label: 'Normal Logistics', value: `${normalLogisticsFee}%`, icon: Truck, color: 'text-blue-600' },
    { label: 'Express Uplift', value: `${expressSurcharge}%`, icon: Zap, color: 'text-amber-500' },
    { label: 'Essential Base', value: `${essentialFee}%`, icon: Sparkles, color: 'text-emerald-500' },
    { label: 'Heritage Premium', value: `${heritageFee}%`, icon: Gem, color: 'text-purple-500' },
    { label: 'Free Delivery At', value: `₹${freeDeliveryThreshold}`, icon: Award, color: 'text-rose-500' }
  ], [expressSurcharge, normalLogisticsFee, essentialFee, heritageFee, freeDeliveryThreshold]);

  if (isLoading) {
    return (
        <div className="h-full w-full flex items-center justify-center p-20">
            <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin" />
        </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 pb-20">
      <PageHeader 
        title="Services & Pricing" 
        actions={[
          { label: 'Refresh Data', icon: RefreshCw, variant: 'secondary', onClick: fetchData },
          { label: isSaving ? 'Syncing...' : 'Save & Deploy', icon: Save, variant: 'primary', onClick: handleSave, disabled: isSaving }
        ]}
      />

      <div className="p-8 space-y-8 max-w-[1400px] mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">

            {/* Advance Payment Card */}
            <div className="bg-white rounded-sm border border-slate-200 overflow-hidden shadow-sm transition-all duration-500">
                <div className="p-6 bg-blue-50/30 border-b border-blue-100 flex items-center gap-4">
                    <div className="w-10 h-10 bg-blue-600 text-white flex items-center justify-center rounded-sm">
                        <CreditCard size={18} />
                    </div>
                    <div>
                        <h3 className="text-[11px] font-black text-blue-900 uppercase tracking-widest">Advance Payment (%)</h3>
                        <p className="text-[9px] font-bold text-blue-600/60 uppercase tracking-widest mt-1">Required deposit amount</p>
                    </div>
                </div>
                <div className="p-8 space-y-6">
                    <div className="relative group">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">%</span>
                        <input 
                            type="number" 
                            value={advancePercentage}
                            onChange={(e) => setAdvancePercentage(e.target.value)}
                            className="w-full pl-10 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-sm text-sm font-bold text-slate-900 focus:bg-white focus:border-slate-900 outline-none transition-all"
                        />
                    </div>
                </div>
            </div>



        </div>

        {/* Action Button Section */}
        <div className="flex justify-center pt-8">
            <button 
                onClick={handleSave}
                disabled={isSaving}
                className="px-16 py-4 bg-slate-900 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded-sm hover:bg-slate-800 transition-all flex items-center gap-3 shadow-xl hover:shadow-2xl active:scale-[0.98]"
            >
                {isSaving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                SAVE DATA
            </button>
        </div>

      </div>
    </div>
  );
}
