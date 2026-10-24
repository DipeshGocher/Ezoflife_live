import { servicePricing } from '../../../lib/servicePricing';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { BASE_URL, authApi, UPLOADS_URL } from '../../../lib/api';
import { Autocomplete } from '@react-google-maps/api';

const getFieldStatus = (fieldName, isRevisionRequired, currentUser) => {
    if (!isRevisionRequired || !currentUser?.rejectionFlags) return 'normal';
    return currentUser.rejectionFlags.includes(fieldName) ? 'rejected' : 'approved';
};

const FieldHighlight = ({ name, children, isRevisionRequired, currentUser }) => {
    const status = getFieldStatus(name, isRevisionRequired, currentUser);
    if (status === 'rejected') {
        return (
            <div className="relative">
                <div className="absolute -left-3 top-0 bottom-0 w-1 bg-rose-500 rounded-full animate-pulse" />
                {children}
                <div className="mt-2 flex items-center gap-1.5 text-rose-600">
                    <span className="material-symbols-outlined text-xs">error</span>
                    <span className="text-[8px] font-black uppercase tracking-widest">Correction Required</span>
                </div>
            </div>
        );
    }
    return children;
};

const RegisterAsVendorPage = () => {
  const navigate = useNavigate();
  const [showLanding, setShowLanding] = useState(() => {
    const savedStep = localStorage.getItem('vendor_onboarding_step');
    return savedStep ? false : true;
  });
  const [step, setStep] = useState(() => {
    const savedStep = localStorage.getItem('vendor_onboarding_step');
    return savedStep ? parseInt(savedStep, 10) : 1;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [masterServices, setMasterServices] = useState([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [isGstVerified, setIsGstVerified] = useState(false);
  const [verifyingGst, setVerifyingGst] = useState(false);
  const [bankVerified, setBankVerified] = useState(false);
  const [verifyingBank, setVerifyingBank] = useState(false);
  const [showAmountInput, setShowAmountInput] = useState(false); // "verifying with bank" state
  const [bankRegisteredName, setBankRegisteredName] = useState('');
  // Instant verification unavailable (RazorpayX down / not configured): the
  // application can still be submitted and the admin verifies the account.
  const [bankCheckUnavailable, setBankCheckUnavailable] = useState(false);
  const [isAgreed, setIsAgreed] = useState(false);
  const [resolvedGpsAddress, setResolvedGpsAddress] = useState('');
  const [isResolvingGpsAddress, setIsResolvingGpsAddress] = useState(false);
  const [autocomplete, setAutocomplete] = useState(null);
  const [isMapLoaded, setIsMapLoaded] = useState(!!window.google);

  React.useEffect(() => {
    if (window.google) {
      setIsMapLoaded(true);
    } else {
      const interval = setInterval(() => {
        if (window.google) {
          setIsMapLoaded(true);
          clearInterval(interval);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, []);

  const onPlaceChanged = () => {
    if (autocomplete !== null) {
      const place = autocomplete.getPlace();
      if (place.geometry && place.geometry.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        const address = place.formatted_address || '';
        setFormData(prev => ({
          ...prev,
          businessAddress: address,
          location: { lat, lng }
        }));
        setResolvedGpsAddress(address);
      }
    }
  };
  
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{}'));
  const isPendingVendor = currentUser?.onboardingStage && 
                         currentUser?.onboardingStage !== 'NONE' && 
                         currentUser?.onboardingStage !== 'COMPLETED' &&
                         currentUser?.status !== 'revision_required';
  const isRevisionRequired = currentUser?.status === 'revision_required';
  const [isNameEditable, setIsNameEditable] = useState(false);

  const [formData, setFormData] = useState({
    // Step 1: Basic Profile
    ownerName: '',
    businessType: '', // Proprietorship, Partnership, Pvt Ltd, Franchise, Unregistered/Local
    facilityName: '',
    
    // Step 2: Business Verification (KYV)
    panNumber: '',
    panDoc: null,
    gstNumber: '',
    gstDoc: null,
    aadharNumber: '',
    aadharDoc: null,
    msmeDoc: null,
    franchiseDoc: null,

    // Step 3: Facility Logistics
    businessAddress: '',
    location: null,
    exteriorPhoto: null,
    interiorPhotos: [],
    walkthroughVideo: null,

    // Step 4: Financials & Agreement
    bankAccountName: '',
    bankAccountNumber: '',
    ifscCode: '',
    bankName: '',
    chequeDoc: null,
    agreedToTerms: false,

    serviceRates: {} 
  });

  const benefits = [
    'More Earnings',
    'Daily Orders',
    'Business Growth',
    'Easy Settlements'
  ];

  const entityTypes = [
    'Proprietorship',
    'Partnership',
    'Pvt Ltd',
    'Franchise',
    'Unregistered/Local'
  ];

  useEffect(() => {
    const syncUser = async () => {
        const userId = currentUser?._id || currentUser?.id;
        if (!userId) return;
        try {
            const response = await fetch(`${BASE_URL}/auth/profile/${userId}`);
            const data = await response.json();
            if (data) {
                const updatedUser = { ...currentUser, ...data };
                localStorage.setItem('user', JSON.stringify(updatedUser));
                setCurrentUser(updatedUser);

                // If revision required, pre-fill form from DB
                if (data.status === 'revision_required') {
                    setFormData(prev => ({
                        ...prev,
                        ownerName: data.ownerName || '',
                        businessType: data.businessType || '',
                        facilityName: data.facilityName || '',
                        panNumber: data.panNumber || '',
                        gstNumber: data.gstNumber || '',
                        aadharNumber: data.aadharNumber || '',
                        businessAddress: data.businessAddress || '',
                        location: data.location || null,
                        bankAccountName: data.bankDetails?.accountHolderName || '',
                        bankAccountNumber: data.bankDetails?.accountNumber || '',
                        ifscCode: data.bankDetails?.ifscCode || '',
                        bankName: data.bankDetails?.bankName || '',
                        // Documents are strings (URLs) in DB, but formData expects File objects or URLs
                        // We'll treat them as "Already Uploaded" if strings exist
                        panDoc: data.panDoc || null,
                        gstDoc: data.gstDoc || null,
                        aadharDoc: data.aadharDoc || null,
                        msmeDoc: data.msmeDoc || null,
                        franchiseDoc: data.franchiseDoc || null,
                        chequeDoc: data.chequeDoc || null,
                        exteriorPhoto: data.exteriorPhoto || null,
                        interiorPhotos: data.interiorPhotos || [],
                        walkthroughVideo: data.walkthroughVideo || null
                    }));
                    
                    // Also mark as verified if data exists and not flagged
                    if (data.bankDetails?.accountNumber && !data.rejectionFlags?.includes('bankDetails')) {
                        setBankVerified(true);
                    }
                    if (data.gstNumber && !data.rejectionFlags?.includes('gstNumber')) {
                        setIsGstVerified(true);
                    }
                }
            }
        } catch (err) {
            console.error('Sync Error:', err);
        }
    };
    syncUser();
  }, []);

  useEffect(() => {
    // Logic for steps will go here
    if (!isRevisionRequired) {
        const savedFormData = localStorage.getItem('vendor_onboarding_form');
        if (savedFormData) {
            const parsed = JSON.parse(savedFormData);
            setFormData(prev => ({ 
                ...prev, 
                ...parsed,
                ownerName: parsed.ownerName || currentUser?.displayName || ''
            }));
        } else {
            setFormData(prev => ({ ...prev, ownerName: currentUser?.displayName || '' }));
        }
    }
  }, [isRevisionRequired, currentUser]);

  useEffect(() => {
    localStorage.setItem('vendor_onboarding_form', JSON.stringify(formData));
    localStorage.setItem('vendor_onboarding_step', step.toString());
  }, [formData, step]);

  useEffect(() => {
      const resolveInitialAddress = async () => {
          if (formData.location && formData.location.lat && formData.location.lng && !resolvedGpsAddress && !isResolvingGpsAddress) {
              const lat = formData.location.lat;
              const lng = formData.location.lng;
              setIsResolvingGpsAddress(true);
              try {
                  let address = '';
                  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
                      headers: { 'Accept-Language': 'en' }
                  });
                  if (res.ok) {
                      const data = await res.json();
                      if (data && data.display_name) {
                          address = data.display_name;
                      }
                  }
                  if (!address) {
                      const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
                      if (API_KEY) {
                          const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${API_KEY}`);
                          const data = await response.json();
                          if (data.status === 'OK' && data.results.length > 0) {
                              address = data.results[0].formatted_address;
                          }
                      }
                  }
                  if (address) {
                      setResolvedGpsAddress(address);
                  }
              } catch (e) {
                  console.error('Error resolving initial GPS address:', e);
              } finally {
                  setIsResolvingGpsAddress(false);
              }
          }
      };
      resolveInitialAddress();
  }, [formData.location]);

  useEffect(() => {
    // Logic for steps will go here
  }, [step]);

  const handleVerifyGst = async () => {
    if (!formData.gstNumber || formData.gstNumber.length !== 15) {
        toast.error('Please enter a valid 15-digit GST number');
        return;
    }
    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (!gstRegex.test(formData.gstNumber)) {
        toast.error('Invalid GST Number format');
        return;
    }

    try {
        setVerifyingGst(true);
        const response = await fetch(`${BASE_URL}/supplier/verify-gst`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gstNumber: formData.gstNumber })
        });
        const result = await response.json();

        if (result.success) {
            setIsGstVerified(true);
            toast.success('GST Verified Successfully!');
        } else {
            toast.error(result.message || 'GST verification failed');
        }
    } catch (error) {
        console.error('GST Verification Error:', error);
        toast.error('Failed to verify GST. Please try again.');
    } finally {
        setVerifyingGst(false);
    }
  };

  const handleNext = () => {
    if (step === 1) {
        if (!formData.ownerName || !formData.businessType || !formData.facilityName) {
            toast.error('Please fill all mandatory fields');
            return;
        }
        setStep(2);
    }
  };

  const handleInitiateBankVerify = async () => {
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    const trimmedPan = (formData.panNumber || '').trim().toUpperCase();
    if (!panRegex.test(trimmedPan)) {
        toast.error('Invalid PAN Number format (ABCDE1234F)');
        return;
    }

    const trimmedAcc = (formData.bankAccountNumber || '').trim();
    const trimmedIfsc = (formData.ifscCode || '').trim().toUpperCase();

    if (!trimmedAcc || !trimmedIfsc) {
        toast.error('Please enter Account Number and IFSC Code');
        return;
    }

    try {
        setVerifyingBank(true);
        const response = await fetch(`${BASE_URL}/supplier/initiate-bank-verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accountNumber: trimmedAcc,
                ifscCode: trimmedIfsc,
                accountHolderName: formData.ownerName || ''
            })
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 503) {
            setBankCheckUnavailable(true);
            setVerifyingBank(false);
            toast(result.message || 'Instant bank verification is unavailable. You can still submit.', { duration: 6000 });
            return;
        }
        if (!response.ok) throw new Error(result.message || 'Failed to initiate verification');
        toast(result.message, { duration: 5000 });
        setShowAmountInput(true);
        pollBankVerification();
    } catch (error) {
        console.error('Bank verify error:', error);
        toast.error(error.message || 'Bank verification service unavailable');
        setVerifyingBank(false);
    }
  };

  // Poll RazorpayX's result until the bank confirms (or rejects) the account.
  const pollBankVerification = async (attempt = 0) => {
    try {
        const response = await fetch(`${BASE_URL}/supplier/complete-bank-verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const result = await response.json().catch(() => ({}));
        if (response.status === 202 && attempt < 20) {
            setTimeout(() => pollBankVerification(attempt + 1), 3000);
            return;
        }
        setVerifyingBank(false);
        setShowAmountInput(false);
        if (response.ok && result.status === 'verified') {
            const verifiedName = result.registeredName || '';
            const firstName = (formData.ownerName || '').toLowerCase().split(' ')[0];
            if (verifiedName && firstName && !verifiedName.toLowerCase().includes(firstName)) {
                toast(`Account name on bank record: ${verifiedName} — it doesn't match the owner name.`, { duration: 6000 });
            }
            setBankRegisteredName(verifiedName);
            setBankVerified(true);
            toast.success('Bank Account Verified Successfully!');
        } else if (response.status === 202) {
            toast('Verification is taking longer than usual. Try again in a minute.');
        } else {
            toast.error(result.message || 'Bank verification failed');
        }
    } catch {
        setVerifyingBank(false);
        setShowAmountInput(false);
        toast.error('Could not check the verification status');
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    
    if (!bankVerified && !bankCheckUnavailable) {
        toast.error('Please verify your bank account first');
        return;
    }
    if (!formData.chequeDoc) {
        toast.error('Please upload Cancelled Cheque/Passbook copy');
        return;
    }
    if (!isAgreed) {
        toast.error('Please accept the Terms & Conditions');
        return;
    }

    try {
        setIsSubmitting(true);
        const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
        const userId = storedUser.id || storedUser._id;

        if (!userId) {
            toast.error('Session expired. Please login again.');
            navigate('/auth');
            return;
        }

        // Final API call to become a vendor
        const submissionData = new FormData();
        
        // Append all fields to FormData
        Object.keys(formData).forEach(key => {
            if (key === 'interiorPhotos') {
                formData[key].forEach(file => submissionData.append('interiorPhotos', file));
            } else if (key === 'serviceRates') {
                submissionData.append(key, JSON.stringify(formData[key]));
            } else if (key === 'location') {
                submissionData.append(key, JSON.stringify(formData[key]));
            } else if (formData[key] !== null) {
                submissionData.append(key, formData[key]);
            }
        });

        const response = await fetch(`${BASE_URL}/auth/become-vendor/${userId}`, {
            method: 'PATCH',
            body: submissionData
        });

        const result = await response.json();

        if (response.ok) {
            toast.success('Application submitted for Admin approval! 🎉');
            const updatedUser = { ...storedUser, role: 'Vendor', status: 'pending' };
            localStorage.setItem('user', JSON.stringify(updatedUser));
            localStorage.removeItem('vendor_onboarding_form');
            localStorage.removeItem('vendor_onboarding_step');
            navigate('/');
        } else {
            toast.error(result.message || 'Submission failed');
        }
    } catch (err) {
        console.error('Submission error:', err);
        toast.error('Failed to submit application');
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleFileChange = (e, field) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    for (const file of files) {
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        
        if (isImage && file.size > 5 * 1024 * 1024) {
            toast.error(`Image ${file.name} exceeds 5MB limit`);
            return;
        }
        if (isVideo && file.size > 20 * 1024 * 1024) {
            toast.error(`Video ${file.name} exceeds 20MB limit`);
            return;
        }
        if (isVideo && !['video/mp4', 'video/quicktime'].includes(file.type)) {
            toast.error(`Unsupported video format. Use MP4/MOV.`);
            return;
        }
    }

    if (field === 'interiorPhotos') {
        const currentPhotos = formData.interiorPhotos || [];
        const newPhotos = [...currentPhotos, ...files].slice(0, 2);
        setFormData(prev => ({ ...prev, [field]: newPhotos }));
        toast.success(`${newPhotos.length} Interior Photos Added`);
    } else {
        const file = files[0];
        setFormData(prev => ({ ...prev, [field]: file }));
        toast.success(`${field.toUpperCase().replace(/DOC|PHOTO|VIDEO/g, '')} Uploaded`);
    }
  };

  const getYouTubeEmbedUrl = (url) => {
    if (!url || typeof url !== 'string') return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) 
      ? `https://www.youtube.com/embed/${match[2]}`
      : null;
  };

  const FilePreview = ({ file, onRemove }) => {
    const [url, setUrl] = React.useState("");
    const [isImage, setIsImage] = React.useState(false);
    const [isVideo, setIsVideo] = React.useState(false);
    const [isYouTube, setIsYouTube] = React.useState(false);
    const [fileName, setFileName] = React.useState("File");

    React.useEffect(() => {
        let objectUrl = "";
        if (typeof file === 'string') {
            const fullUrl = file.startsWith('http') ? file : `${UPLOADS_URL}${file}`;
            
            const ytUrl = getYouTubeEmbedUrl(fullUrl);
            if (ytUrl) {
                setIsYouTube(true);
                setUrl(ytUrl);
                setIsImage(false);
                setIsVideo(false);
                setFileName("YouTube Video");
            } else {
                setIsYouTube(false);
                setUrl(fullUrl);
                setIsImage(/\.(jpg|jpeg|png|webp|gif)$/i.test(fullUrl));
                setIsVideo(/\.(mp4|mov|webm)$/i.test(fullUrl));
                setFileName(fullUrl.split('/').pop());
            }
        } else if (file instanceof File || file instanceof Blob) {
            setIsYouTube(false);
            setIsImage(file.type?.startsWith('image/'));
            setIsVideo(file.type?.startsWith('video/'));
            objectUrl = URL.createObjectURL(file);
            setUrl(objectUrl);
            setFileName(file.name);
        }

        return () => {
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [file]);

    if (!file || !url) return null;

    return (
      <div className="relative mt-2 group">
        <div className="w-full h-32 rounded-2xl overflow-hidden border border-outline-variant/10 bg-slate-50 flex items-center justify-center">
            {isImage ? (
                <img src={url} alt="Preview" className="w-full h-full object-cover" />
            ) : isYouTube ? (
                <iframe 
                    src={url} 
                    className="w-full h-full" 
                    frameBorder="0" 
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                    allowFullScreen 
                />
            ) : isVideo ? (
                <video src={url} className="w-full h-full object-cover" controls />
            ) : (
                <div className="flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-3xl text-slate-300">description</span>
                    <span className="text-[8px] font-black uppercase text-slate-400">{fileName.slice(0, 20)}</span>
                </div>
            )}
        </div>
        <button 
            type="button"
            onClick={(e) => {
                e.preventDefault();
                onRemove();
            }}
            className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-rose-500 text-white shadow-lg flex items-center justify-center hover:bg-rose-600 transition-all z-10"
        >
            <span className="material-symbols-outlined text-sm">close</span>
        </button>
      </div>
    );
  };

  if (isPendingVendor) {
    const userId = currentUser?._id || currentUser?.id;
    const stage = currentUser?.onboardingStage || 'INITIAL_REVIEW';

    if (stage === 'SERVICE_SELECTION') {
        return <ServiceSelectionView userId={userId} onComplete={() => window.location.reload()} />;
    }

    const stageConfig = {
        'INITIAL_REVIEW': {
            title: 'Audit in Progress',
            subtitle: 'Phase 1: Document & Facility Verification',
            icon: 'verified_user',
            color: 'text-amber-500',
            bg: 'bg-amber-50'
        },
        'FINAL_REVIEW': {
            title: 'Final Onboarding',
            subtitle: 'Phase 3: Catalog & Policy Review',
            icon: 'inventory_2',
            color: 'text-primary',
            bg: 'bg-primary/5'
        }
    };

    const config = stageConfig[stage] || stageConfig['INITIAL_REVIEW'];

    return (
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center"
      >
        <div className={`w-24 h-24 ${config.bg} ${config.color} rounded-[2rem] flex items-center justify-center mb-8 shadow-xl shadow-black/5`}>
            <span className="material-symbols-outlined text-4xl leading-none">{config.icon}</span>
        </div>
        
        <div className="max-w-md mx-auto space-y-4">
            <h2 className="text-3xl font-black tracking-tighter text-slate-900 leading-tight">
                {config.title}
            </h2>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
                {config.subtitle}
            </p>
            
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm mt-8">
                <div className="flex items-center gap-4 text-left">
                    <div className="w-1.5 h-12 bg-emerald-500 rounded-full" />
                    <div>
                        <p className="text-xs font-black text-slate-900 uppercase tracking-widest">Request Status</p>
                        <p className="text-sm text-slate-500 font-bold mt-1">Our team is currently auditing your dossier. You will be notified once the next phase opens.</p>
                    </div>
                </div>
            </div>

            <button 
                onClick={() => navigate('/')}
                className="mt-12 px-8 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all"
            >
                Back to Dashboard
            </button>
        </div>
      </motion.div>
    );
  }

  if (showLanding) {
    return (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="bg-slate-50/50 text-on-background min-h-[100dvh] flex flex-col font-body pb-32"
        >
          <header className="fixed top-0 left-0 right-0 z-50 bg-slate-50/80 backdrop-blur-md p-6 border-b border-outline-variant/10">
            <div className="max-w-2xl mx-auto flex items-center justify-between">
              <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center text-on-surface">
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <h1 className="font-headline font-black text-lg tracking-tighter uppercase">Vendor Program</h1>
              <div className="w-10"></div>
            </div>
          </header>
    
          <main className="pt-28 px-6 max-w-2xl mx-auto w-full flex flex-col items-center">
            <motion.section 
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="mb-12 text-center"
            >
              <div className="w-20 h-20 bg-primary/10 rounded-[2rem] flex items-center justify-center text-primary mx-auto mb-6">
                <span className="material-symbols-outlined text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>storefront</span>
              </div>
              <h2 className="text-4xl font-black tracking-tighter leading-none mb-6 text-on-surface">Become a<br/><span className="text-primary italic">Vendor</span></h2>
            </motion.section>
    
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white rounded-[3rem] p-10 w-full border border-outline-variant/5 shadow-[0_40px_80px_rgba(0,0,0,0.03)] mb-12"
            >
              <div className="space-y-6">
                {benefits.map((benefit, i) => (
                  <div key={i} className="flex items-center gap-4 group">
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white shrink-0 shadow-lg shadow-green-500/20">
                      <span className="material-symbols-outlined text-sm font-black">check</span>
                    </div>
                    <span className="text-lg font-black text-on-surface tracking-tight">{benefit}</span>
                  </div>
                ))}
              </div>
            </motion.div>
    
            <motion.button 
              onClick={() => setShowLanding(false)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              whileTap={{ scale: 0.95 }}
              className="w-full max-w-sm bg-primary text-on-primary py-6 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 flex items-center justify-center gap-3 active:scale-95 transition-all"
            >
              Apply Now
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </motion.button>
          </main>
        </motion.div>
      );
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-slate-50/50 text-on-background min-h-[100dvh] flex flex-col font-body"
    >
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-50/80 backdrop-blur-md px-6 pt-6 pb-4 border-b border-outline-variant/10">
        <div className="max-w-2xl mx-auto">
            <div className="flex items-center justify-between mb-6">
                <button onClick={() => step === 1 ? setShowLanding(true) : setStep(step - 1)} className="w-10 h-10 rounded-xl bg-surface-container-low flex items-center justify-center text-on-surface">
                    <span className="material-symbols-outlined">{step === 1 ? 'close' : 'arrow_back'}</span>
                </button>
                <h1 className="font-headline font-black text-lg tracking-tighter uppercase">Vendor Onboarding</h1>
                <div className="w-10"></div>
            </div>

            <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-outline-variant/10 rounded-full overflow-hidden">
                    <motion.div 
                        initial={{ width: '0%' }}
                        animate={{ width: `${(step / 4) * 100}%` }}
                        className="h-full bg-primary"
                    />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-primary shrink-0 tabular-nums">STEP 0{step} / 04</span>
            </div>
        </div>
      </header>

      <main className="pt-32 px-6 pb-32 max-w-2xl mx-auto w-full">
        {isRevisionRequired && (
            <motion.div 
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mb-10 bg-rose-50 border border-rose-100 rounded-[2rem] p-6 shadow-xl shadow-rose-500/5 relative overflow-hidden"
            >
                <div className="absolute top-0 right-0 p-4 opacity-5">
                    <span className="material-symbols-outlined text-4xl text-rose-500">warning</span>
                </div>
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-full bg-rose-500 text-white flex items-center justify-center">
                        <span className="material-symbols-outlined text-sm font-black">feedback</span>
                    </div>
                    <h3 className="text-[10px] font-black text-rose-900 uppercase tracking-widest">Correction Required</h3>
                </div>
                <p className="text-xs font-bold text-rose-700 leading-relaxed bg-white/50 p-4 rounded-xl border border-rose-100">
                    <span className="opacity-60 block text-[8px] font-black uppercase mb-1">Admin Notes:</span>
                    "{currentUser.rejectionReason || 'Please review your documents and re-submit.'}"
                </p>
                <p className="text-[9px] font-black text-rose-400 uppercase tracking-widest mt-4 ml-1">Update the necessary fields and re-submit for review.</p>
            </motion.div>
        )}
        {step === 1 && (
            <div className="space-y-12">
                <section className="space-y-8">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-xl bg-primary text-on-primary flex items-center justify-center font-black text-xs">01</span>
                            <h3 className="font-black text-sm uppercase tracking-widest text-on-surface">Basic Profile</h3>
                        </div>
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60 ml-11">Define who you are and your business type</p>
                    </div>
                    
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-2">Owner Full Name</label>
                            <FieldHighlight name="ownerName" isRevisionRequired={isRevisionRequired} currentUser={currentUser}>
                                <div className={`relative group ${getFieldStatus('ownerName', isRevisionRequired, currentUser) === 'rejected' ? 'ring-2 ring-rose-500/20' : ''}`}>
                                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-primary opacity-40">
                                        <span className="material-symbols-outlined">person</span>
                                    </div>
                                    <input 
                                        required
                                        value={formData.ownerName}
                                        onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                                        placeholder="ENTER OWNER'S FULL LEGAL NAME"
                                        readOnly={!isNameEditable}
                                        className={`w-full pl-16 pr-14 p-3.5 bg-white border rounded-[1.5rem] font-bold text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all uppercase tracking-tight shadow-sm ${getFieldStatus('ownerName', isRevisionRequired, currentUser) === 'rejected' ? 'border-rose-500' : 'border-outline-variant/10'} ${!isNameEditable ? 'bg-slate-50/50 cursor-not-allowed select-none' : ''}`}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setIsNameEditable(!isNameEditable)}
                                        className="absolute right-6 top-1/2 -translate-y-1/2 text-primary hover:text-primary-dark transition-colors cursor-pointer flex items-center justify-center"
                                        title={isNameEditable ? "Lock editing" : "Edit name manually"}
                                    >
                                        <span className="material-symbols-outlined text-base">
                                            {isNameEditable ? 'lock_open' : 'edit'}
                                        </span>
                                    </button>
                                </div>
                            </FieldHighlight>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-2">Business Entity Type</label>
                            <FieldHighlight name="businessType" isRevisionRequired={isRevisionRequired} currentUser={currentUser}>
                                <div className="relative">
                                    <button 
                                        type="button"
                                        onClick={() => setShowTypePicker(true)}
                                        className={`w-full pl-16 p-3.5 bg-white border rounded-[1.5rem] font-bold text-sm text-left outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all uppercase tracking-tight shadow-sm flex items-center justify-between ${getFieldStatus('businessType', isRevisionRequired, currentUser) === 'rejected' ? 'border-rose-500' : 'border-outline-variant/10'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="absolute left-6 top-1/2 -translate-y-1/2 text-primary opacity-40">
                                                <span className="material-symbols-outlined">category</span>
                                            </div>
                                            <span className={formData.businessType ? 'text-on-surface' : 'text-slate-400'}>
                                                {formData.businessType || 'SELECT ENTITY TYPE'}
                                            </span>
                                        </div>
                                        <span className="material-symbols-outlined text-on-surface-variant opacity-40">expand_more</span>
                                    </button>
                                    {/* ... AnimatePresence for Picker omitted for brevity as it's separate ... */}
                                </div>
                            </FieldHighlight>
                        </div>

                                <AnimatePresence>
                                    {showTypePicker && (
                                        <>
                                            <motion.div 
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                onClick={() => setShowTypePicker(false)}
                                                className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100]"
                                            />
                                            <motion.div 
                                                initial={{ y: '100%' }}
                                                animate={{ y: 0 }}
                                                exit={{ y: '100%' }}
                                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                                className="fixed bottom-0 left-0 right-0 bg-white rounded-t-[3rem] p-8 z-[101] shadow-[0_-20px_40px_rgba(0,0,0,0.1)]"
                                            >
                                                <div className="w-12 h-1.5 bg-slate-100 rounded-full mx-auto mb-8" />
                                                <h4 className="text-xl font-black tracking-tighter text-on-surface mb-6 uppercase text-center">Business Entity Type</h4>
                                                <div className="grid gap-3">
                                                    {entityTypes.map(type => (
                                                        <button
                                                            key={type}
                                                            type="button"
                                                            onClick={() => {
                                                                setFormData({ ...formData, businessType: type });
                                                                setShowTypePicker(false);
                                                            }}
                                                            className={`w-full p-5 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all flex items-center justify-between ${formData.businessType === type ? 'bg-primary text-on-primary shadow-lg shadow-primary/20' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
                                                        >
                                                            {type}
                                                            {formData.businessType === type && <span className="material-symbols-outlined text-sm">check_circle</span>}
                                                        </button>
                                                    ))}
                                                </div>
                                                <button 
                                                    onClick={() => setShowTypePicker(false)}
                                                    className="w-full mt-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]"
                                                >
                                                    Cancel
                                                </button>
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-2">Facility Name</label>
                            <FieldHighlight name="facilityName" isRevisionRequired={isRevisionRequired} currentUser={currentUser}>
                                <div className={`relative group ${getFieldStatus('facilityName', isRevisionRequired, currentUser) === 'rejected' ? 'ring-2 ring-rose-500/20' : ''}`}>
                                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-primary opacity-40">
                                        <span className="material-symbols-outlined">storefront</span>
                                    </div>
                                    <input 
                                        required
                                        value={formData.facilityName}
                                        onChange={(e) => setFormData({ ...formData, facilityName: e.target.value })}
                                        placeholder="ENTER SHOP/FACTORY NAME"
                                        className={`w-full pl-16 p-3.5 bg-white border rounded-[1.5rem] font-bold text-sm outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all uppercase tracking-tight shadow-sm ${getFieldStatus('facilityName', isRevisionRequired, currentUser) === 'rejected' ? 'border-rose-500' : 'border-outline-variant/10'}`}
                                    />
                                </div>
                            </FieldHighlight>
                        </div>
                    </div>
                </section>

                <div className="fixed bottom-16 left-0 right-0 px-6 py-2 bg-white/80 backdrop-blur-md border-t border-outline-variant/10 z-[40]">
                    <div className="max-w-2xl mx-auto flex gap-4">
                        <button 
                            type="button"
                            onClick={() => setShowLanding(true)}
                            className="flex-1 py-3 border border-outline-variant/10 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] hover:bg-slate-50 transition-all"
                        >
                            Back
                        </button>
                        <button 
                            type="button"
                            onClick={handleNext}
                            className="flex-[2] bg-slate-900 text-on-primary py-3 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 flex items-center justify-center gap-3 active:scale-95 transition-all"
                        >
                            Continue
                            <span className="material-symbols-outlined text-lg">arrow_forward</span>
                        </button>
                    </div>
                </div>
            </div>
        )}

        {step === 2 && (
            <div className="space-y-10">
                <section className="space-y-8">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-xl bg-primary text-on-primary flex items-center justify-center font-black text-xs">02</span>
                            <h3 className="font-black text-sm uppercase tracking-widest text-on-surface">KYV Verification</h3>
                        </div>
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60 ml-11">Legal & tax compliance documents</p>
                    </div>

                    <div className="space-y-8">
                        {/* PAN Section */}
                        <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface">PAN Card Details</label>
                                <span className="text-[8px] font-black bg-primary/10 text-primary px-2 py-1 rounded-md uppercase">Mandatory</span>
                            </div>
                            <FieldHighlight name="panNumber">
                                <div className="relative">
                                    <input 
                                        value={formData.panNumber}
                                        onChange={(e) => setFormData({ ...formData, panNumber: e.target.value.toUpperCase() })}
                                        placeholder="ABCDE1234F"
                                        className={`w-full p-4 bg-slate-50 border-2 rounded-xl font-black text-sm outline-none transition-all uppercase tracking-[0.2em] ${getFieldStatus('panNumber') === 'rejected' ? 'border-rose-500' : 'border-transparent'}`}
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">SECURELY STORED</span>
                                </div>
                            </FieldHighlight>
                            <FieldHighlight name="panDoc">
                                <label className={`flex items-center justify-center gap-3 p-4 border-2 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 transition-all ${getFieldStatus('panDoc') === 'rejected' ? 'border-rose-500 bg-rose-50' : 'border-outline-variant/20'}`}>
                                    <input type="file" className="hidden" onChange={(e) => handleFileChange(e, 'panDoc')} />
                                    <span className="material-symbols-outlined text-slate-400">upload_file</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        {formData.panDoc ? 'PAN Uploaded' : 'Upload PAN Copy'}
                                    </span>
                                </label>
                            </FieldHighlight>
                            <FilePreview file={formData.panDoc} onRemove={() => setFormData({ ...formData, panDoc: null })} />
                        </div>

                        {/* GST Section */}
                        {(formData.businessType === 'Pvt Ltd' || formData.businessType === 'Franchise') && (
                            <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/5 shadow-sm space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface">GST Registration</label>
                                    <span className="text-[8px] font-black bg-slate-100 text-slate-400 px-2 py-1 rounded-md uppercase">Optional</span>
                                </div>
                                <FieldHighlight name="gstNumber">
                                    <div className="flex gap-2">
                                        <input 
                                            value={formData.gstNumber}
                                            onChange={(e) => setFormData({ ...formData, gstNumber: e.target.value.toUpperCase() })}
                                            placeholder="27AAAAA0000A1Z5"
                                            className={`flex-1 p-4 bg-slate-50 border-2 rounded-xl font-black text-xs outline-none transition-all uppercase tracking-widest ${getFieldStatus('gstNumber') === 'rejected' ? 'border-rose-500' : 'border-transparent'}`}
                                        />
                                        <button 
                                            onClick={handleVerifyGst}
                                            disabled={verifyingGst || isGstVerified}
                                            className={`px-6 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${isGstVerified ? 'bg-green-500 text-white' : 'bg-primary text-on-primary shadow-lg shadow-primary/20'}`}
                                        >
                                            {verifyingGst ? '...' : isGstVerified ? 'Verified' : 'Verify'}
                                        </button>
                                    </div>
                                </FieldHighlight>
                                <FieldHighlight name="gstDoc">
                                    <label className={`flex items-center justify-center gap-3 p-4 border-2 border-dashed rounded-xl cursor-pointer hover:bg-slate-50 transition-all ${getFieldStatus('gstDoc') === 'rejected' ? 'border-rose-500 bg-rose-50' : 'border-outline-variant/20'}`}>
                                        <input type="file" className="hidden" onChange={(e) => handleFileChange(e, 'gstDoc')} />
                                        <span className="material-symbols-outlined text-slate-400">upload_file</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            {formData.gstDoc ? 'GST Uploaded' : 'Upload GST Certificate'}
                                        </span>
                                    </label>
                                </FieldHighlight>
                                <FilePreview file={formData.gstDoc} onRemove={() => setFormData({ ...formData, gstDoc: null })} />
                            </div>
                        )}

                        {(formData.businessType === 'Proprietorship' || formData.businessType === 'Unregistered/Local') && (
                            <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/5 shadow-sm space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface">Aadhaar Number</label>
                                    <span className="text-[8px] font-black bg-rose-100 text-rose-600 px-2 py-1 rounded-md uppercase">Mandatory</span>
                                </div>
                                <FieldHighlight name="aadharNumber">
                                    <div className="relative">
                                        <input 
                                            type="text"
                                            value={formData.aadharNumber || ''}
                                            maxLength={12}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/\D/g, '').slice(0, 12);
                                                setFormData({ ...formData, aadharNumber: val });
                                            }}
                                            placeholder="•••• •••• 1234"
                                            className="w-full p-4 bg-slate-50 rounded-xl font-bold text-sm border focus:ring-2 focus:ring-primary/20 outline-none tracking-[0.3em] border-outline-variant/10"
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">SECURELY STORED</span>
                                    </div>
                                </FieldHighlight>
                                <FieldHighlight name="aadharDoc">
                                    <label className="flex items-center justify-center gap-3 p-4 border-2 border-dashed border-outline-variant/20 rounded-xl cursor-pointer hover:bg-slate-50 transition-all">
                                        <input type="file" className="hidden" onChange={(e) => handleFileChange(e, 'aadharDoc')} />
                                        <span className="material-symbols-outlined text-slate-400">upload_file</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            {formData.aadharDoc ? 'Aadhaar Uploaded' : 'Upload Aadhaar Copy'}
                                        </span>
                                    </label>
                                </FieldHighlight>
                                <FilePreview file={formData.aadharDoc} onRemove={() => setFormData({ ...formData, aadharDoc: null })} />
                            </div>
                        )}

                        {!(formData.businessType === 'Pvt Ltd' || formData.businessType === 'Franchise') && !formData.gstNumber && (
                            <div className="bg-amber-50 p-6 rounded-[2rem] border border-amber-100 shadow-sm space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-amber-700">MSME (Udyam) Certificate</label>
                                    <span className="text-[8px] font-black bg-amber-200 text-amber-700 px-2 py-1 rounded-md uppercase">Required (No GST)</span>
                                </div>
                                <FieldHighlight name="msmeDoc">
                                    <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest leading-relaxed">Since GST is not provided, MSME certificate is mandatory for verification.</p>
                                    <label className="flex items-center justify-center gap-3 p-4 border-2 border-dashed border-amber-200 rounded-xl cursor-pointer hover:bg-amber-100/50 transition-all">
                                        <input type="file" className="hidden" onChange={(e) => handleFileChange(e, 'msmeDoc')} />
                                        <span className="material-symbols-outlined text-amber-500">card_membership</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
                                            {formData.msmeDoc ? 'MSME Uploaded' : 'Upload MSME Certificate'}
                                        </span>
                                    </label>
                                </FieldHighlight>
                                <FilePreview file={formData.msmeDoc} onRemove={() => setFormData({ ...formData, msmeDoc: null })} />
                            </div>
                        )}

                        {formData.businessType === 'Franchise' && (
                            <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/5 shadow-sm space-y-4">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-on-surface">Franchise Agreement / NOC</label>
                                    <span className="text-[8px] font-black bg-rose-100 text-rose-600 px-2 py-1 rounded-md uppercase">Mandatory</span>
                                </div>
                                <FieldHighlight name="franchiseDoc">
                                    <label className="flex items-center justify-center gap-3 p-4 border-2 border-dashed border-outline-variant/20 rounded-xl cursor-pointer hover:bg-slate-50 transition-all">
                                        <input type="file" className="hidden" onChange={(e) => handleFileChange(e, 'franchiseDoc')} />
                                        <span className="material-symbols-outlined text-slate-400">history_edu</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            {formData.franchiseDoc ? 'Agreement Uploaded' : 'Upload NOC/Agreement'}
                                        </span>
                                    </label>
                                </FieldHighlight>
                                <FilePreview file={formData.franchiseDoc} onRemove={() => setFormData({ ...formData, franchiseDoc: null })} />
                            </div>
                        )}
                    </div>
                </section>

                <div className="fixed bottom-16 left-0 right-0 px-6 py-2 bg-white/80 backdrop-blur-md border-t border-outline-variant/10 z-[40]">
                    <div className="max-w-2xl mx-auto flex gap-4">
                        <button 
                            onClick={() => setStep(1)}
                            className="flex-1 py-3 border border-outline-variant/10 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] hover:bg-slate-50 transition-all"
                        >
                            Back
                        </button>
                        <button 
                            onClick={() => {
                                if (!formData.panNumber || !formData.panDoc) {
                                    toast.error('PAN details are mandatory');
                                    return;
                                }
                                const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
                                if (!panRegex.test(formData.panNumber.trim().toUpperCase())) {
                                    toast.error('Invalid PAN Number format (ABCDE1234F)');
                                    return;
                                }
                                if ((formData.businessType === 'Pvt Ltd' || formData.businessType === 'Franchise') && (!formData.gstNumber || !formData.gstDoc || !isGstVerified)) {
                                    toast.error(isGstVerified ? 'GST Certificate is mandatory' : 'Please verify your GST number first');
                                    return;
                                }
                                if ((formData.businessType === 'Proprietorship' || formData.businessType === 'Unregistered/Local') && (!formData.aadharNumber || !formData.aadharDoc)) {
                                    toast.error('Aadhaar details are mandatory');
                                    return;
                                }
                                if (!formData.gstNumber && !formData.msmeDoc) {
                                    toast.error('MSME Certificate is mandatory if GST is not provided');
                                    return;
                                }
                                if (formData.businessType === 'Franchise' && !formData.franchiseDoc) {
                                    toast.error('Franchise Agreement/NOC is mandatory');
                                    return;
                                }
                                setStep(3);
                            }}
                            className="flex-[2] bg-slate-900 text-white py-3 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl flex items-center justify-center gap-3 active:scale-95 transition-all"
                        >
                            Next
                            <span className="material-symbols-outlined">arrow_forward</span>
                        </button>
                    </div>
                </div>
            </div>
        )}
        {step === 3 && (
            <div className="space-y-10 pb-40">
                <section className="space-y-8">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-xl bg-primary text-on-primary flex items-center justify-center font-black text-xs">03</span>
                            <h3 className="font-black text-sm uppercase tracking-widest text-on-surface">Facility Logistics</h3>
                        </div>
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60 ml-11">Physical location & infrastructure audit</p>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface">Geo-Location (GPS)</label>
                                <span className="text-[8px] font-black bg-rose-100 text-rose-600 px-2 py-1 rounded-md uppercase">Mandatory</span>
                            </div>
                            <FieldHighlight name="location">
                                <button 
                                    type="button"
                                    onClick={() => {
                                        if ("geolocation" in navigator) {
                                            navigator.geolocation.getCurrentPosition(async (position) => {
                                                const lat = position.coords.latitude;
                                                const lng = position.coords.longitude;
                                                setFormData(prev => ({ 
                                                    ...prev, 
                                                    location: { lat, lng }
                                                }));
                                                toast.success('Location Captured!');
                                                
                                                setIsResolvingGpsAddress(true);
                                                try {
                                                    let address = '';
                                                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
                                                        headers: { 'Accept-Language': 'en' }
                                                    });
                                                    if (res.ok) {
                                                        const data = await res.json();
                                                        if (data && data.display_name) {
                                                            address = data.display_name;
                                                        }
                                                    }
                                                    if (!address) {
                                                        const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
                                                        if (API_KEY) {
                                                            const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${API_KEY}`);
                                                            const data = await response.json();
                                                            if (data.status === 'OK' && data.results.length > 0) {
                                                                address = data.results[0].formatted_address;
                                                            }
                                                        }
                                                    }
                                                    if (address) {
                                                        setResolvedGpsAddress(address);
                                                        // Auto-fill address field if currently empty
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            businessAddress: prev.businessAddress ? prev.businessAddress : address
                                                        }));
                                                    }
                                                } catch (err) {
                                                    console.error('Error geocoding location:', err);
                                                } finally {
                                                    setIsResolvingGpsAddress(false);
                                                }
                                            }, (err) => {
                                                toast.error('Failed to get location. Please enable GPS.');
                                            });
                                        }
                                    }}
                                    className={`w-full p-6 rounded-2xl flex items-center justify-center gap-3 border-2 border-dashed transition-all ${formData.location ? 'bg-primary/5 border-primary text-primary' : 'border-outline-variant/20 text-slate-400'}`}
                                >
                                    <span className="material-symbols-outlined">{formData.location ? 'location_on' : 'my_location'}</span>
                                    <span className="text-xs font-black uppercase tracking-widest">
                                        {formData.location ? `Captured: ${formData.location.lat.toFixed(4)}, ${formData.location.lng.toFixed(4)}` : 'Capture Current Location'}
                                    </span>
                                </button>
                                
                                {isResolvingGpsAddress && (
                                    <div className="mt-3 flex items-center justify-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">
                                        <span className="material-symbols-outlined text-xs animate-spin">sync</span>
                                        Resolving Address...
                                    </div>
                                )}
                                
                                {resolvedGpsAddress && (
                                    <div className="mt-3 p-4 bg-slate-50 border border-slate-200/60 rounded-[1.25rem] flex items-start gap-3">
                                        <span className="material-symbols-outlined text-primary text-base shrink-0 mt-0.5">location_on</span>
                                        <div className="space-y-1">
                                            <p className="text-[9px] font-black text-primary uppercase tracking-widest">Resolved Address</p>
                                            <p className="text-xs font-bold text-slate-600 leading-relaxed uppercase">{resolvedGpsAddress}</p>
                                        </div>
                                    </div>
                                )}
                            </FieldHighlight>
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-2">Full Facility Address</label>
                            <FieldHighlight name="businessAddress">
                                {isMapLoaded ? (
                                    <Autocomplete
                                        onLoad={ac => setAutocomplete(ac)}
                                        onPlaceChanged={onPlaceChanged}
                                    >
                                        <input 
                                            required
                                            type="text"
                                            value={formData.businessAddress}
                                            onChange={(e) => setFormData({ ...formData, businessAddress: e.target.value })}
                                            placeholder="SEARCH ADDRESS..."
                                            className="w-full p-4.5 bg-white border border-outline-variant/10 rounded-[1.5rem] font-bold text-sm outline-none focus:border-primary transition-all uppercase tracking-tight shadow-sm"
                                        />
                                    </Autocomplete>
                                ) : (
                                    <input 
                                        required
                                        type="text"
                                        value={formData.businessAddress}
                                        onChange={(e) => setFormData({ ...formData, businessAddress: e.target.value })}
                                        placeholder="ENTER FULL ADDRESS WITH LANDMARK..."
                                        className="w-full p-4.5 bg-white border border-outline-variant/10 rounded-[1.5rem] font-bold text-sm outline-none focus:border-primary transition-all uppercase tracking-tight shadow-sm"
                                    />
                                )}
                            </FieldHighlight>
                        </div>

                        <div className="grid gap-4">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant ml-2">Facility Media Audit</h4>
                            
                            <div className="space-y-2">
                                <input type="file" accept="image/*" className="hidden" id="exterior" onChange={(e) => handleFileChange(e, 'exteriorPhoto')} />
                                <FieldHighlight name="exteriorPhoto">
                                    <label htmlFor="exterior" className={`flex items-center justify-between p-6 bg-white border rounded-[1.5rem] cursor-pointer transition-all ${formData.exteriorPhoto ? 'border-primary' : 'border-outline-variant/10'}`}>
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                                                <span className="material-symbols-outlined text-xl">camera_outdoor</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black uppercase tracking-tight">Exterior Photo</span>
                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Shop Signage/Front View</span>
                                            </div>
                                        </div>
                                        {formData.exteriorPhoto ? <span className="material-symbols-outlined text-green-500">check_circle</span> : <span className="material-symbols-outlined text-slate-300">add_a_photo</span>}
                                    </label>
                                </FieldHighlight>
                                <FilePreview file={formData.exteriorPhoto} onRemove={() => setFormData({ ...formData, exteriorPhoto: null })} />
                            </div>

                            <div className="space-y-2">
                                <input type="file" multiple accept="image/*" className="hidden" id="interiors" onChange={(e) => handleFileChange(e, 'interiorPhotos')} />
                                <FieldHighlight name="interiorPhotos">
                                    <label htmlFor="interiors" className={`flex items-center justify-between p-6 bg-white border rounded-[1.5rem] cursor-pointer transition-all ${formData.interiorPhotos.length >= 2 ? 'border-primary' : 'border-outline-variant/10'}`}>
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                                                <span className="material-symbols-outlined">factory</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black uppercase tracking-tight">Interior Photos (2x)</span>
                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Machine/Ironing/Work Area</span>
                                            </div>
                                        </div>
                                        <span className="text-xs font-black text-primary bg-primary/5 px-3 py-1 rounded-full">{formData.interiorPhotos.length}/2</span>
                                    </label>
                                </FieldHighlight>
                                <div className="grid grid-cols-2 gap-3">
                                    {formData.interiorPhotos.map((file, idx) => (
                                        <FilePreview 
                                            key={idx} 
                                            file={file} 
                                            onRemove={() => {
                                                const newPhotos = formData.interiorPhotos.filter((_, i) => i !== idx);
                                                setFormData({ ...formData, interiorPhotos: newPhotos });
                                            }} 
                                        />
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <input type="file" accept="video/*" className="hidden" id="video" onChange={(e) => {
                                    const file = e.target.files[0];
                                    if (file && file.size > 50 * 1024 * 1024) {
                                        toast.error('Video must be less than 50MB');
                                        return;
                                    }
                                    handleFileChange(e, 'walkthroughVideo');
                                }} />
                                <FieldHighlight name="walkthroughVideo">
                                    <label htmlFor="video" className={`flex items-center justify-between p-6 bg-white border rounded-[1.5rem] cursor-pointer transition-all ${formData.walkthroughVideo ? 'border-primary' : 'border-outline-variant/10'}`}>
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                                                <span className="material-symbols-outlined">videocam</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-black uppercase tracking-tight">Walkthrough Video (Optional)</span>
                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">30-sec video tour (Max 50MB)</span>
                                            </div>
                                        </div>
                                        {formData.walkthroughVideo ? <span className="material-symbols-outlined text-green-500">check_circle</span> : <span className="material-symbols-outlined text-slate-300">video_call</span>}
                                    </label>
                                </FieldHighlight>
                                <FilePreview file={formData.walkthroughVideo} onRemove={() => setFormData({ ...formData, walkthroughVideo: null })} />
                            </div>
                        </div>
                    </div>
                </section>

                <div className="fixed bottom-16 left-0 right-0 px-6 py-2 bg-white/80 backdrop-blur-md border-t border-outline-variant/10 z-[40]">
                    <div className="max-w-2xl mx-auto flex gap-4">
                        <button 
                            type="button"
                            onClick={() => setStep(2)}
                            className="flex-1 py-3 border border-outline-variant/10 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] hover:bg-slate-50 transition-all"
                        >
                            Back
                        </button>
                        <button 
                            type="button"
                            onClick={() => {
                                if (!formData.location) {
                                    toast.error('Please capture GPS location');
                                    return;
                                }
                                if (!formData.businessAddress) {
                                    toast.error('Address is mandatory');
                                    return;
                                }
                                if (!formData.exteriorPhoto || formData.interiorPhotos.length < 2) {
                                    toast.error('Exterior and Interior photos are mandatory');
                                    return;
                                }
                                setStep(4);
                            }}
                            className="flex-[2] bg-primary text-on-primary py-3 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 flex items-center justify-center gap-3 active:scale-95 transition-all"
                        >
                            Next Step
                            <span className="material-symbols-outlined text-lg">arrow_forward</span>
                        </button>
                    </div>
                </div>
            </div>
        )}

        {step === 4 && (
            <div className="space-y-10 pb-40">
                <section className="space-y-8">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                            <span className="w-8 h-8 rounded-xl bg-primary text-on-primary flex items-center justify-center font-black text-xs">04</span>
                            <h3 className="font-black text-sm uppercase tracking-widest text-on-surface">Financials & Agreement</h3>
                        </div>
                        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest opacity-60 ml-11">Payment settlement & legal binding</p>
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white p-6 rounded-[2rem] border border-outline-variant/5 shadow-sm space-y-4">
                            <div className="flex items-center justify-between">
                                <label className="text-[10px] font-black uppercase tracking-widest text-on-surface">Settlement Account</label>
                                <span className="text-[8px] font-black bg-green-100 text-green-600 px-2 py-1 rounded-md uppercase tabular-nums">Required</span>
                            </div>
                            <FieldHighlight name="bankDetails">
                                <div className={`space-y-2 p-2 rounded-xl border-2 transition-all ${getFieldStatus('bankDetails') === 'rejected' ? 'border-rose-500 bg-rose-50' : 'border-transparent'}`}>
                                    <input 
                                        disabled={bankVerified}
                                        value={formData.bankAccountName}
                                        onChange={(e) => setFormData({ ...formData, bankAccountName: e.target.value })}
                                        placeholder="ACCOUNT HOLDER NAME"
                                        className="w-full p-4 bg-white rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all uppercase tracking-widest border border-slate-100"
                                    />
                                    <input 
                                        disabled={bankVerified}
                                        value={formData.bankName}
                                        onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                                        placeholder="BANK NAME"
                                        className="w-full p-4 bg-white rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all uppercase tracking-widest border border-slate-100"
                                    />
                                    <input 
                                        disabled={bankVerified}
                                        value={formData.bankAccountNumber}
                                        onChange={(e) => setFormData({ ...formData, bankAccountNumber: e.target.value })}
                                        placeholder="ACCOUNT NUMBER"
                                        className="w-full p-4 bg-white rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all uppercase tracking-widest border border-slate-100"
                                    />
                                    <input 
                                        disabled={bankVerified}
                                        value={formData.ifscCode}
                                        onChange={(e) => setFormData({ ...formData, ifscCode: e.target.value.toUpperCase() })}
                                        placeholder="IFSC CODE"
                                        className="w-full p-4 bg-white rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all uppercase tracking-widest border border-slate-100"
                                    />
                                </div>
                            </FieldHighlight>
                            {!bankVerified && !showAmountInput && (
                                <button 
                                    onClick={handleInitiateBankVerify}
                                    disabled={verifyingBank}
                                    className="w-full py-4 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-slate-900/20 active:scale-95 transition-all"
                                >
                                    {verifyingBank ? 'Processing...' : 'Verify Bank Account (₹1 Deposit)'}
                                </button>
                            )}

                            {showAmountInput && (
                                <div className="p-5 bg-primary/5 rounded-2xl border border-primary/10 flex items-center justify-center gap-3">
                                    <span className="material-symbols-outlined text-primary animate-spin text-base">progress_activity</span>
                                    <p className="text-[10px] font-black text-primary uppercase tracking-widest">
                                        Verifying with your bank — sending ₹1…
                                    </p>
                                </div>
                            )}

                            {bankCheckUnavailable && !bankVerified && (
                                <p className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                                    Instant verification is unavailable. You can submit; our team will verify your account from the cancelled cheque.
                                </p>
                            )}

                            {bankVerified && (
                                <div className="flex items-center justify-center gap-3 p-4 bg-green-50 text-green-600 rounded-xl border border-green-100">
                                    <span className="material-symbols-outlined text-sm">verified</span>
                                    <span className="text-[10px] font-black uppercase tracking-widest">Bank Account Verified{bankRegisteredName ? ` · ${bankRegisteredName}` : ''}</span>
                                </div>
                            )}
                        </div>

                        {/* Cheque Upload */}
                        <div className="space-y-2">
                            <input type="file" className="hidden" id="cheque" onChange={(e) => handleFileChange(e, 'chequeDoc')} />
                            <FieldHighlight name="chequeDoc">
                                <label htmlFor="cheque" className={`flex items-center justify-between p-6 bg-white border rounded-[1.5rem] cursor-pointer transition-all ${formData.chequeDoc ? 'border-primary' : 'border-outline-variant/10'} ${getFieldStatus('chequeDoc') === 'rejected' ? 'border-rose-500 bg-rose-50' : ''}`}>
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                                            <span className="material-symbols-outlined">payments</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[11px] font-black uppercase tracking-tight">Cancelled Cheque / Passbook</span>
                                            <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Mandatory for Payouts</span>
                                        </div>
                                    </div>
                                    {formData.chequeDoc ? <span className="material-symbols-outlined text-green-500">check_circle</span> : <span className="material-symbols-outlined text-slate-300">upload</span>}
                                </label>
                            </FieldHighlight>
                            <FilePreview file={formData.chequeDoc} onRemove={() => setFormData({ ...formData, chequeDoc: null })} />
                        </div>

                        {/* Agreement */}
                        <div className="p-6 bg-slate-50 rounded-[2rem] space-y-4">
                            <div className="flex gap-4">
                                <div 
                                    onClick={() => setIsAgreed(!isAgreed)}
                                    className={`w-6 h-6 rounded-lg border-2 flex-shrink-0 flex items-center justify-center cursor-pointer transition-all ${isAgreed ? 'bg-primary border-primary text-on-primary' : 'border-slate-300 bg-white'}`}
                                >
                                    {isAgreed && <span className="material-symbols-outlined text-sm">check</span>}
                                </div>
                                <p className="text-[10px] font-bold text-slate-500 leading-relaxed uppercase tracking-widest">
                                    I hereby confirm that all the information provided is accurate and I agree to the <span className="text-primary underline">Vendor Agreement</span> and <span className="text-primary underline">Privacy Policy</span>.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="fixed bottom-[80px] left-0 right-0 px-6 py-4 bg-white/80 backdrop-blur-md border-t border-outline-variant/10 z-[50]">
                    <div className="max-w-2xl mx-auto flex gap-4">
                        <button 
                            onClick={() => setStep(3)}
                            className="flex-1 py-3 border border-outline-variant/10 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] hover:bg-slate-50 transition-all"
                        >
                            Back
                        </button>
                        <button 
                            onClick={handleSubmit}
                            disabled={isSubmitting || !bankVerified || !isAgreed}
                            className="flex-[2] bg-primary text-on-primary py-3 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                        >
                            {isSubmitting ? 'Submitting...' : 'Submit for Review'}
                            {!isSubmitting && <span className="material-symbols-outlined text-lg">send</span>}
                        </button>
                    </div>
                </div>
            </div>
        )}
      </main>
    </motion.div>
  );
};

export default RegisterAsVendorPage;

const ServiceSelectionView = ({ userId, onComplete }) => {
    const [masterServices, setMasterServices] = useState([]);
    const [selected, setSelected] = useState({}); // { id: rate }
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [geoStatus, setGeoStatus] = useState('checking'); // checking, no_location, outside, error, ok
    const [areaName, setAreaName] = useState('');
    const [businessAddress, setBusinessAddress] = useState('');

    // Category & Sub Category Filter States
    const [selectedCategory, setSelectedCategory] = useState('');
    const [selectedSubCategory, setSelectedSubCategory] = useState('');
    const [activeTierMode, setActiveTierMode] = useState('both'); // all, essential, heritage, both

    const activeSelectedCount = Object.keys(selected).filter(id => selected[id] !== undefined && selected[id] !== '').length;
    const allSelected = masterServices.length > 0 && activeSelectedCount === masterServices.length;

    const essentialServices = masterServices.filter(s => s.tier === 'Essential');
    const heritageServices = masterServices.filter(s => s.tier === 'Heritage');

    const allEssentialSelected = essentialServices.length > 0 && essentialServices.every(s => selected[s._id] !== undefined && selected[s._id] !== '');
    const allHeritageSelected = heritageServices.length > 0 && heritageServices.every(s => selected[s._id] !== undefined && selected[s._id] !== '');
    const bothSelected = allSelected;

    const categories = [...new Set(masterServices.map(s => s.category).filter(Boolean))];
    const subCategories = [...new Set(masterServices.filter(s => s.category === selectedCategory).map(s => s.subCategory).filter(Boolean))];

    const filteredServices = masterServices.filter(svc => {
        const matchesCategory = svc.category === selectedCategory;
        const matchesSubCategory = svc.subCategory === selectedSubCategory;
        return matchesCategory && matchesSubCategory;
    });

    const handleCategoryChange = (cat) => {
        setSelectedCategory(cat);
        const relatedSubs = [...new Set(masterServices.filter(s => s.category === cat).map(s => s.subCategory).filter(Boolean))];
        if (relatedSubs.length > 0) {
            setSelectedSubCategory(relatedSubs[0]);
        } else {
            setSelectedSubCategory('');
        }
    };

    const handleToggleAll = () => {
        setActiveTierMode('all');
        if (allSelected) {
            setSelected({});
        } else {
            const newSelected = {};
            masterServices.forEach(svc => {
                newSelected[svc._id] = String(svc.baseNormal);
            });
            setSelected(newSelected);
        }
    };

    const handleToggleTier = (tierType) => {
        setActiveTierMode(tierType);
        const targetServices = masterServices.filter(svc => {
            if (tierType === 'both') return true;
            return svc.tier.toLowerCase() === tierType.toLowerCase();
        });

        if (targetServices.length === 0) return;

        const allTargetSelected = targetServices.every(svc => selected[svc._id] !== undefined && selected[svc._id] !== '');

        const newSelected = { ...selected };
        if (allTargetSelected) {
            targetServices.forEach(svc => {
                delete newSelected[svc._id];
            });
        } else {
            targetServices.forEach(svc => {
                newSelected[svc._id] = String(svc.baseNormal);
            });
        }
        setSelected(newSelected);
    };

    useEffect(() => {
        const resolveLocationAndCatalog = async () => {
            try {
                // 1. Fetch User Profile to get GPS coordinates and business address
                const profileRes = await fetch(`${BASE_URL}/auth/profile/${userId}`);
                if (!profileRes.ok) throw new Error('Failed to fetch user profile');
                const user = await profileRes.json();
                
                const lat = user?.location?.lat;
                const lng = user?.location?.lng;
                setBusinessAddress(user?.businessAddress || user?.shopDetails?.address || '');
                
                if (!lat || !lng || lat === 0 || lng === 0) {
                    setGeoStatus('no_location');
                    setLoading(false);
                    return;
                }
                
                // 2. Verify coordinates with Geofence check availability
                const geoRes = await fetch(`${BASE_URL}/geofence/check-availability?lat=${lat}&lng=${lng}`);
                if (!geoRes.ok) throw new Error('Geofence check failed');
                const geoData = await geoRes.json();
                
                if (!geoData.available || !geoData.areaId) {
                    setGeoStatus('outside');
                    setLoading(false);
                    return;
                }
                
                setAreaName(geoData.name);
                setGeoStatus('ok');
                
                // 3. Fetch localized pricing catalog for the resolved fenceId
                const pricingRes = await fetch(`${BASE_URL}/master-pricing?fenceId=${geoData.areaId}&limit=10000`);
                if (!pricingRes.ok) throw new Error('Failed to fetch master pricing');
                const pricingData = await pricingRes.json();
                
                // Map MasterPricing list and calculate the 4 pricing variants using multipliers
                const mappedServices = (pricingData.data || [])
                    .filter(item => item.serviceId && item.isActive !== false)
                    .map(item => {
                        const priceOptions = {
                            pricingFactor: geoData.pricingFactor ?? 1,
                            allowDiscount: geoData.allowDiscount !== false,
                            expressMultiplier: geoData.expressMultiplier ?? 1,
                            heritageMultiplier: geoData.heritageMultiplier ?? 1,
                        };
                        const baseNormal = servicePricing(item.serviceId, priceOptions).price;
                        const baseExpress = servicePricing(item.serviceId, { ...priceOptions, isExpress: true }).price;
                        const heritageNormal = servicePricing(item.serviceId, { ...priceOptions, isHeritage: true }).price;
                        const heritageExpress = servicePricing(item.serviceId, { ...priceOptions, isHeritage: true, isExpress: true }).price;

                        return {
                            _id: item.serviceId._id,
                            itemName: item.serviceId.itemName,
                            skuId: item.serviceId.skuId,
                            icon: item.serviceId.icon || 'local_laundry_service',
                            tier: item.serviceId.tier || 'Essential',
                            category: item.categoryId?.mainCategory || '',
                            subCategory: item.categoryId?.subCategory || '',
                            basePrice: item.serviceId.basePrice ?? item.basePrice ?? 0,
                            baseNormal,
                            baseExpress,
                            heritageNormal,
                            heritageExpress
                        };
                    });
                
                setMasterServices(mappedServices);
                if (mappedServices.length > 0) {
                    const uniqueCats = [...new Set(mappedServices.map(s => s.category).filter(Boolean))];
                    if (uniqueCats.length > 0) {
                        setSelectedCategory(uniqueCats[0]);
                        const firstCatSubs = [...new Set(mappedServices.filter(s => s.category === uniqueCats[0]).map(s => s.subCategory).filter(Boolean))];
                        if (firstCatSubs.length > 0) {
                            setSelectedSubCategory(firstCatSubs[0]);
                        }
                    }
                }
            } catch (err) {
                console.error('Resolve Catalog Error:', err);
                setGeoStatus('error');
            } finally {
                setLoading(false);
            }
        };
        resolveLocationAndCatalog();
    }, [userId]);

    const handleSubmit = async () => {
        const payload = Object.keys(selected)
            .filter(id => selected[id] > 0)
            .map(id => ({ id, vendorRate: Number(selected[id]) }));

        if (payload.length === 0) {
            toast.error('Select at least one service');
            return;
        }

        setSubmitting(true);
        try {
            const result = await authApi.submitVendorServices(userId, payload);
            if (result.user) {
                // Update local storage stage
                const stored = JSON.parse(localStorage.getItem('user') || '{}');
                localStorage.setItem('user', JSON.stringify({ ...stored, onboardingStage: 'FINAL_REVIEW' }));
                toast.success('Catalog submitted for final audit!');
                onComplete();
            }
        } catch (err) {
            toast.error('Submission failed');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center font-black uppercase tracking-widest text-slate-400">Loading Catalog...</div>;

    if (geoStatus !== 'ok') {
        const errorConfigs = {
            'no_location': {
                icon: 'location_off',
                title: 'No GPS Coordinates Captured',
                desc: 'Your profile is missing coordinate data. Please contact the administration to update your facility coordinates.',
                color: 'text-amber-500',
                bg: 'bg-amber-50'
            },
            'outside': {
                icon: 'gpp_bad',
                title: 'Outside Active Service Area',
                desc: 'Your shop coordinates do not match any of our active geofenced service zones. Currently, we cannot accept catalog rates for this location.',
                color: 'text-rose-500',
                bg: 'bg-rose-50'
            },
            'error': {
                icon: 'cloud_off',
                title: 'Verification Failed',
                desc: 'An error occurred while contacting our location-matching registry. Please reload the page to try again.',
                color: 'text-slate-500',
                bg: 'bg-slate-100'
            }
        };

        const config = errorConfigs[geoStatus] || errorConfigs['error'];

        return (
            <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-8 text-center">
                <div className={`w-20 h-20 ${config.bg} ${config.color} rounded-[2rem] flex items-center justify-center mb-6 shadow-xl shadow-black/5`}>
                    <span className="material-symbols-outlined text-3xl leading-none">{config.icon}</span>
                </div>
                <h2 className="text-2xl font-black tracking-tighter text-slate-900 uppercase mb-2">{config.title}</h2>
                <p className="text-xs font-bold text-slate-400 max-w-sm uppercase leading-relaxed mb-6">{config.desc}</p>
                <button 
                    onClick={() => window.location.reload()}
                    className="px-8 py-3 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-md"
                >
                    Retry Verification
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6 pt-16 pb-32">
            <div className="max-w-2xl mx-auto space-y-8">
                <header className="space-y-4 px-2">
                    <h2 className="text-center text-base sm:text-lg font-black tracking-tight text-slate-700 whitespace-nowrap">
                        select services that your facility can provide
                    </h2>
                    <div className="flex items-center justify-between gap-2">
                        <button 
                            type="button"
                            onClick={handleToggleAll}
                            className={`px-3 py-1.5 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer ${
                                activeTierMode === 'all'
                                    ? 'bg-slate-900 border-slate-900 text-white shadow-md' 
                                    : 'bg-white border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50'
                            }`}
                        >
                            All
                        </button>
                        <div className="flex items-center gap-2">
                            <button 
                                type="button"
                                onClick={() => handleToggleTier('essential')}
                                className={`px-3 py-1.5 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer ${
                                    activeTierMode === 'essential'
                                        ? 'bg-slate-900 border-slate-900 text-white shadow-md' 
                                        : 'bg-white border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50'
                                }`}
                            >
                                Essential
                            </button>
                            <button 
                                type="button"
                                onClick={() => handleToggleTier('heritage')}
                                className={`px-3 py-1.5 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer ${
                                    activeTierMode === 'heritage'
                                        ? 'bg-slate-900 border-slate-900 text-white shadow-md' 
                                        : 'bg-white border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50'
                                }`}
                            >
                                Heritage
                            </button>
                            <button 
                                type="button"
                                onClick={() => handleToggleTier('both')}
                                className={`px-3 py-1.5 border rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer ${
                                    activeTierMode === 'both'
                                        ? 'bg-slate-900 border-slate-900 text-white shadow-md' 
                                        : 'bg-white border-slate-200 text-slate-600 shadow-sm hover:bg-slate-50'
                                }`}
                            >
                                Both
                            </button>
                        </div>
                    </div>

                    {/* Category Selector */}
                    {categories.length > 0 && (
                        <div className="flex flex-wrap gap-2 justify-start items-center pt-3 border-t border-slate-100">
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => handleCategoryChange(cat)}
                                    className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer ${
                                        selectedCategory === cat
                                            ? 'bg-primary text-white shadow-md shadow-primary/20'
                                            : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Sub Category Selector */}
                    {subCategories.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 justify-start items-center">
                            {subCategories.map(sub => (
                                <button
                                    key={sub}
                                    type="button"
                                    onClick={() => setSelectedSubCategory(sub)}
                                    className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 cursor-pointer ${
                                        selectedSubCategory === sub
                                            ? 'bg-slate-900 border border-slate-900 text-white shadow-sm'
                                            : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                                    }`}
                                >
                                    {sub}
                                </button>
                            ))}
                        </div>
                    )}
                </header>

                <div className="overflow-x-auto bg-white border border-slate-100 rounded-[2rem] shadow-sm">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                        <thead>
                            <tr className="border-b border-slate-100 bg-slate-50/50">
                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 w-12 text-center">Select</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 w-44">SKU ID</th>
                                <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400">Item Name</th>
                                
                                {(activeTierMode === 'essential' || activeTierMode === 'both' || activeTierMode === 'all') && (
                                    <>
                                        <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Base Normal</th>
                                        <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Base Express</th>
                                    </>
                                )}
                                {(activeTierMode === 'heritage' || activeTierMode === 'both' || activeTierMode === 'all') && (
                                    <>
                                        <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Heritage Normal</th>
                                        <th className="p-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">Heritage Express</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredServices.map(svc => {
                                const isSelected = selected[svc._id] !== undefined;
                                return (
                                    <tr key={svc._id} className={`hover:bg-slate-50/30 transition-colors ${isSelected ? 'bg-primary/5' : ''}`}>
                                        <td className="p-4 text-center">
                                            <input 
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => {
                                                    if (isSelected) {
                                                        const newSel = { ...selected };
                                                        delete newSel[svc._id];
                                                        setSelected(newSel);
                                                    } else {
                                                        setSelected({ ...selected, [svc._id]: String(svc.baseNormal) });
                                                    }
                                                }}
                                                className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary/20 cursor-pointer"
                                            />
                                        </td>
                                        <td className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                            {svc.skuId || 'N/A'}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-3">
                                                <span className="material-symbols-outlined text-slate-400 text-lg">{svc.icon}</span>
                                                <span className="text-sm font-black text-slate-900 uppercase tracking-tight">{svc.itemName}</span>
                                            </div>
                                        </td>
                                        
                                        {(activeTierMode === 'essential' || activeTierMode === 'both' || activeTierMode === 'all') && (
                                            <>
                                                <td className="p-4 text-xs font-bold text-slate-700 text-right">₹{svc.baseNormal}</td>
                                                <td className="p-4 text-xs font-bold text-slate-700 text-right">₹{svc.baseExpress}</td>
                                            </>
                                        )}
                                        {(activeTierMode === 'heritage' || activeTierMode === 'both' || activeTierMode === 'all') && (
                                            <>
                                                <td className="p-4 text-xs font-bold text-slate-700 text-right">₹{svc.heritageNormal}</td>
                                                <td className="p-4 text-xs font-bold text-slate-700 text-right">₹{svc.heritageExpress}</td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="fixed bottom-20 left-0 right-0 p-6 bg-slate-50/80 backdrop-blur-md border-t border-slate-200 z-[60]">
                    <div className="max-w-2xl mx-auto">
                        <button 
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                        >
                            {submitting ? 'Submitting Dossier...' : 'Submit Catalog'}
                            <span className="material-symbols-outlined text-lg">rocket_launch</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
