import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Store,
  MapPin,
  CreditCard,
  FileText,
  ShieldCheck,
  Camera,
  Edit3,
  CheckCircle2,
  Clock,
  Phone,
  Mail,
  UploadCloud,
  ExternalLink,
  LogOut,
  ChevronRight,
  Shield,
  FileCheck2,
  AlertCircle,
  Building2,
} from "lucide-react";
import toast from "react-hot-toast";
import { authApi } from "../../../lib/api";

const formatAddress = (address) => {
  if (!address) return "N/A";
  const pincodeRegex = /^(\d{6})(?:\s*\(Pincode\))?\s*,\s*(.*)$/i;
  const match = address.match(pincodeRegex);
  if (match) {
    const pincode = match[1];
    const restOfAddress = match[2];
    return `${restOfAddress} - ${pincode}`;
  }
  return address;
};

const VendorProfile = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    shopName: "",
    phone: "",
    accountHolderName: "",
    accountNumber: "",
    ifscCode: "",
    bankName: "",
  });

  const effectiveDocuments = useMemo(() => {
    if (!user) return [];
    const list = Array.isArray(user.documents) ? [...user.documents] : [];
    const typeSet = new Set(list.map((d) => d.type?.toLowerCase().trim()));

    const addDoc = (type, url) => {
      if (
        url &&
        typeof url === "string" &&
        url.trim() &&
        !typeSet.has(type.toLowerCase().trim())
      ) {
        list.push({ type, url });
        typeSet.add(type.toLowerCase().trim());
      }
    };

    addDoc("PAN Card", user.panDoc);
    addDoc("GST Certificate", user.gstDoc);
    addDoc("Aadhaar Card", user.aadharDoc);
    addDoc("Cancelled Cheque", user.chequeDoc);
    addDoc("MSME Certificate", user.msmeDoc);
    addDoc("Franchise Agreement", user.franchiseDoc);
    addDoc("Store Exterior", user.exteriorPhoto);
    if (Array.isArray(user.interiorPhotos)) {
      user.interiorPhotos.forEach((photo, idx) => {
        addDoc(`Store Interior ${idx + 1}`, photo);
      });
    }
    addDoc("Facility Video", user.walkthroughVideo);

    return list;
  }, [user]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const storedUser = JSON.parse(
          localStorage.getItem("vendorData") ||
            localStorage.getItem("user") ||
            localStorage.getItem("userData") ||
            "{}",
        );
        const userId = storedUser.id || storedUser._id;

        if (!userId) {
          navigate("/vendor/auth");
          return;
        }

        const data = await authApi.getProfile(userId);
        setUser(data);
        setFormData({
          shopName: data.shopDetails?.name || "",
          phone: data.phone || "",
          accountHolderName: data.bankDetails?.accountHolderName || "",
          accountNumber: data.bankDetails?.accountNumber || "",
          ifscCode: data.bankDetails?.ifscCode || "",
          bankName: data.bankDetails?.bankName || "",
        });
      } catch (err) {
        console.error("Profile fetch error:", err);
        toast.error("Failed to load profile");
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  const handleSave = async () => {
    const loadingToast = toast.loading("Saving changes...");
    try {
      const userId = user.id || user._id;
      const payload = {
        phone: formData.phone,
        shopDetails: {
          ...(user.shopDetails || {}),
          name: formData.shopName,
        },
        bankDetails: {
          accountHolderName: formData.accountHolderName,
          accountNumber: formData.accountNumber,
          ifscCode: formData.ifscCode,
          bankName: formData.bankName,
        },
      };

      const updatedUser = await authApi.updateProfile(userId, payload);
      setUser(updatedUser);

      // Sync updatedUser back to local storage cache
      const rawStored =
        localStorage.getItem("vendorData") ||
            localStorage.getItem("user") ||
        localStorage.getItem("userData");
      if (rawStored) {
        try {
          const parsed = JSON.parse(rawStored);
          let merged;
          if (parsed.user) {
            merged = { ...parsed, user: { ...parsed.user, ...updatedUser } };
          } else {
            merged = { ...parsed, ...updatedUser };
          }
          localStorage.setItem("user", JSON.stringify(merged));
          localStorage.setItem("vendorData", JSON.stringify(merged));
          localStorage.setItem("userData", JSON.stringify(merged));
        } catch (e) {
          console.error("LocalStorage sync error:", e);
        }
      }

      setIsEditing(false);
      toast.success("Profile updated successfully", { id: loadingToast });
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Failed to save changes", { id: loadingToast });
    }
  };

  const handleSignOut = () => {
    localStorage.clear();
    navigate("/vendor/auth");
    toast.success("Signed out successfully");
  };

  const handleDocumentUpdate = async (type, file) => {
    if (!file) return;

    const loadingToast = toast.loading(`Updating ${type}...`);
    try {
      const formDataObj = new FormData();
      formDataObj.append("document", file);
      formDataObj.append("type", type);

      const userId = user.id || user._id;
      const updatedUser = await authApi.updateDocuments(userId, formDataObj);

      setUser(updatedUser);
      toast.success(`${type} updated successfully`, { id: loadingToast });
    } catch (err) {
      console.error("Document update error:", err);
      toast.error(`Failed to update ${type}`, { id: loadingToast });
    }
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const loadingToast = toast.loading("Updating profile image...");
    try {
      const formDataObj = new FormData();
      formDataObj.append("image", file);

      const userId = user.id || user._id;
      const updatedUser = await authApi.updateProfileImage(userId, formDataObj);

      setUser(updatedUser);
      toast.success("Profile image updated", { id: loadingToast });
    } catch (err) {
      console.error("Image upload error:", err);
      toast.error("Failed to update image", { id: loadingToast });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 space-y-3">
        <div className="w-10 h-10 border-4 border-slate-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-black uppercase tracking-widest text-slate-400">
          Loading Vendor Profile...
        </p>
      </div>
    );
  }

  if (!user) return null;

  const isApproved = user.status === "approved";

  return (
    <div className="min-h-screen bg-slate-50/70 text-slate-900 pb-36">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 space-y-8">
        {/* Top Header & Overview Banner */}
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            {/* Avatar & Identity Info */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="relative group w-fit">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageChange}
                  accept="image/*"
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-3xl bg-slate-100 border-4 border-white shadow-md overflow-hidden relative cursor-pointer group"
                  title="Click to update workshop photo">
                  <img
                    src={
                      user.image ||
                      "https://images.unsplash.com/photo-1556740758-90de374c12ad?auto=format&fit=crop&q=80&w=300"
                    }
                    alt="Workshop Profile"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-slate-950/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white">
                    <Camera size={22} />
                    <span className="text-[10px] font-bold uppercase tracking-wider mt-1">
                      Change
                    </span>
                  </div>
                </div>

                <div
                  className={`absolute -bottom-1 -right-1 w-8 h-8 rounded-xl flex items-center justify-center border-2 border-white shadow-md ${
                    isApproved
                      ? "bg-emerald-600 text-white"
                      : "bg-amber-500 text-white"
                  }`}
                  title={
                    isApproved ? "Verified Partner" : "Pending Verification"
                  }>
                  {isApproved ? (
                    <CheckCircle2 size={16} strokeWidth={2.5} />
                  ) : (
                    <Clock size={16} strokeWidth={2.5} />
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-slate-900 text-white border border-slate-900">
                    Vendor Partner
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${
                      isApproved
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}>
                    {user.status || "Pending"}
                  </span>
                </div>

                {isEditing ? (
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Shop / Partner Name
                    </label>
                    <input
                      type="text"
                      value={formData.shopName}
                      onChange={(e) =>
                        setFormData({ ...formData, shopName: e.target.value })
                      }
                      placeholder="Shop / Workshop Name"
                      className="w-full text-lg sm:text-2xl font-black text-slate-900 border border-slate-200 rounded-xl px-4 py-2 bg-slate-50 focus:bg-white focus:border-slate-900 outline-none"
                    />
                  </div>
                ) : (
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                      {user.shopDetails?.name ||
                        user.displayName ||
                        "Vendor Workshop"}
                    </h1>
                    <p className="text-sm font-semibold text-slate-500 mt-0.5">
                      Fulfillment Partner • Laundry & Dry Cleaning Operations
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm font-semibold text-slate-600 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Mail size={15} className="text-slate-400" />
                    <span>{user.email || "partner@ezoflife.in"}</span>
                  </div>
                  <span className="text-slate-300">•</span>
                  <div className="flex items-center gap-1.5">
                    <Phone size={15} className="text-slate-400" />
                    <span>{user.phone || "—"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Profile Action Buttons */}
            <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
              {!isEditing ? (
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-bold uppercase tracking-wider shadow-sm transition-all flex items-center gap-2 cursor-pointer">
                  <Edit3 size={16} />
                  <span>Edit Profile</span>
                </button>
              ) : (
                <div className="flex items-center gap-2.5">
                  <button
                    onClick={() => {
                      setIsEditing(false);
                      setFormData({
                        shopName: user.shopDetails?.name || "",
                        phone: user.phone || "",
                        accountHolderName:
                          user.bankDetails?.accountHolderName || "",
                        accountNumber: user.bankDetails?.accountNumber || "",
                        ifscCode: user.bankDetails?.ifscCode || "",
                        bankName: user.bankDetails?.bankName || "",
                      });
                    }}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer">
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider shadow-md shadow-slate-900/20 transition-all cursor-pointer">
                    Save Changes
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2-Column Responsive Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          {/* Main Info Column (2/3 width on desktop) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Shop & Workshop Information Card */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-7 shadow-xs space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-900 flex items-center justify-center">
                    <Store size={20} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-slate-900">
                      Store & Workshop Details
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      Physical workshop location and commercial service
                      territory
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => navigate("/vendor/addresses")}
                  className="text-xs font-bold text-slate-900 hover:text-indigo-600 transition-colors uppercase tracking-wider cursor-pointer">
                  Manage Address
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
                <div className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Shop / Workshop Name
                  </span>
                  <p className="text-sm sm:text-base font-black text-slate-900">
                    {user.shopDetails?.name || "N/A"}
                  </p>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Operating Address
                  </span>
                  <p className="text-sm font-semibold text-slate-700 leading-relaxed bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                    {formatAddress(user.shopDetails?.address)}
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    GSTIN / Business Registration
                  </span>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono font-black text-slate-900">
                      {user.shopDetails?.gst || "Individual / Non-GST"}
                    </p>
                    {user.shopDetails?.gst && (
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Verified
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Operating City / Zone
                  </span>
                  <p className="text-sm font-bold text-slate-900">
                    {user.shopDetails?.city || "Indore"}
                  </p>
                </div>
              </div>
            </div>

            {/* Bank & Settlement Details Card */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-7 shadow-xs space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CreditCard size={20} />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black text-slate-900">
                      Settlement & Bank Details
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      Customer order earnings are credited directly to this
                      account
                    </p>
                  </div>
                </div>
                {isEditing && (
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Editing Bank Info
                  </span>
                )}
              </div>

              {isEditing ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={formData.accountHolderName}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          accountHolderName: e.target.value,
                        })
                      }
                      placeholder="e.g. Acme Laundry"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-slate-50 focus:bg-white focus:border-slate-900 outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">
                      Bank Name
                    </label>
                    <input
                      type="text"
                      value={formData.bankName}
                      onChange={(e) =>
                        setFormData({ ...formData, bankName: e.target.value })
                      }
                      placeholder="e.g. State Bank of India"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 bg-slate-50 focus:bg-white focus:border-slate-900 outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">
                      IFSC Code
                    </label>
                    <input
                      type="text"
                      value={formData.ifscCode}
                      onChange={(e) =>
                        setFormData({ ...formData, ifscCode: e.target.value })
                      }
                      placeholder="e.g. SBIN0001234"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-mono font-bold text-slate-900 bg-slate-50 focus:bg-white focus:border-slate-900 outline-none uppercase"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-600">
                      Account Number
                    </label>
                    <input
                      type="text"
                      value={formData.accountNumber}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          accountNumber: e.target.value,
                        })
                      }
                      placeholder="e.g. 123456789012"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-mono font-bold text-slate-900 bg-slate-50 focus:bg-white focus:border-slate-900 outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Account Holder
                    </span>
                    <p className="text-sm sm:text-base font-black text-slate-900">
                      {user.bankDetails?.accountHolderName || "N/A"}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Bank Name
                    </span>
                    <p className="text-sm sm:text-base font-black text-slate-900">
                      {user.bankDetails?.bankName || "N/A"}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      IFSC Code
                    </span>
                    <p className="text-sm font-mono font-black text-slate-900 uppercase">
                      {user.bankDetails?.ifscCode || "N/A"}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Account Number
                    </span>
                    <p className="text-sm font-mono font-black text-slate-900 tracking-wider">
                      {user.bankDetails?.accountNumber
                        ? `•••• •••• ${user.bankDetails.accountNumber.slice(-4)}`
                        : "N/A"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar Column (1/3 width on desktop) */}
          <div className="space-y-6">
            {/* Verification Documents Card */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck size={18} className="text-slate-900" />
                  <h3 className="text-base font-black text-slate-900">
                    Documents
                  </h3>
                </div>
                <span className="text-xs font-bold text-slate-400">
                  {effectiveDocuments.length} Attached
                </span>
              </div>

              {effectiveDocuments.length > 0 ? (
                <div className="space-y-2.5">
                  {effectiveDocuments.map((doc, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/70 rounded-2xl border border-slate-100 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-white border border-slate-200/70 flex items-center justify-center text-slate-700 shrink-0 shadow-2xs">
                          <FileText size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-black text-slate-900 uppercase tracking-tight truncate">
                            {doc.type}
                          </p>
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors inline-flex items-center gap-1 mt-0.5">
                            <span>Preview File</span>
                            <ExternalLink size={10} />
                          </a>
                        </div>
                      </div>

                      <label
                        className="p-2 rounded-xl hover:bg-white text-slate-400 hover:text-slate-900 transition-all cursor-pointer"
                        title="Replace Document">
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) =>
                            handleDocumentUpdate(doc.type, e.target.files[0])
                          }
                        />
                        <UploadCloud size={16} />
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <AlertCircle
                    size={24}
                    className="mx-auto text-slate-400 mb-2"
                  />
                  <p className="text-xs font-bold text-slate-600">
                    No documents uploaded yet
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Upload Shop License, Aadhaar, or GST Certificate
                  </p>
                </div>
              )}

              {/* Add Missing Document Option */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Add Supporting Documents
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    "Shop License",
                    "GST Certificate",
                    "PAN Card",
                    "Aadhaar Card",
                    "Cancelled Cheque",
                    "MSME Certificate",
                  ]
                    .filter(
                      (type) =>
                        !effectiveDocuments.some(
                          (d) =>
                            d.type
                              ?.toLowerCase()
                              .includes(type.toLowerCase()) ||
                            type.toLowerCase().includes(d.type?.toLowerCase()),
                        ),
                    )
                    .slice(0, 4)
                    .map((type) => (
                      <label key={type} className="cursor-pointer">
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) =>
                            handleDocumentUpdate(type, e.target.files[0])
                          }
                        />
                        <div className="p-3 border border-dashed border-slate-300 hover:border-slate-500 hover:bg-slate-50 rounded-xl text-center transition-all">
                          <UploadCloud
                            size={16}
                            className="mx-auto text-slate-700 mb-1"
                          />
                          <p className="text-[11px] font-bold text-slate-800 leading-tight">
                            {type}
                          </p>
                        </div>
                      </label>
                    ))}
                </div>
              </div>
            </div>

            {/* Legal & App Links */}
            <div className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs divide-y divide-slate-100">
              <button
                onClick={() => navigate("/privacy?role=vendor")}
                className="w-full py-3 px-2 flex items-center justify-between hover:bg-slate-50 rounded-xl transition-colors text-left group cursor-pointer">
                <div className="flex items-center gap-3">
                  <Shield
                    size={16}
                    className="text-slate-400 group-hover:text-slate-900 transition-colors"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Privacy Policy
                  </span>
                </div>
                <ChevronRight
                  size={14}
                  className="text-slate-400 group-hover:translate-x-0.5 transition-transform"
                />
              </button>

              <button
                onClick={() => navigate("/terms?role=vendor")}
                className="w-full py-3 px-2 flex items-center justify-between hover:bg-slate-50 rounded-xl transition-colors text-left group cursor-pointer">
                <div className="flex items-center gap-3">
                  <FileText
                    size={16}
                    className="text-slate-400 group-hover:text-slate-900 transition-colors"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Terms & Conditions
                  </span>
                </div>
                <ChevronRight
                  size={14}
                  className="text-slate-400 group-hover:translate-x-0.5 transition-transform"
                />
              </button>
            </div>

            {/* Sign Out Button */}
            <button
              onClick={handleSignOut}
              className="w-full py-4 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-2xl text-xs font-black text-rose-600 uppercase tracking-widest flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-xs active:scale-98">
              <LogOut size={16} />
              <span>Log Out Vendor Account</span>
            </button>

            <div className="text-center pt-2">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                EZ OF LIFE VENDOR PORTAL • v3.2.0
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default VendorProfile;
