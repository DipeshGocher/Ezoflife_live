import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  serviceApi,
  orderApi,
  authApi,
  masterServiceApi,
  mediaApi,
  promotionApi,
  geofenceApi,
} from "../../../lib/api";
import toast from "react-hot-toast";
import {
  GoogleMap,
  Marker,
  Autocomplete,
  useJsApiLoader,
} from "@react-google-maps/api";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "../../../lib/googleMaps";
import { locationService } from "../../../lib/locationService";
import { shippingConfigApi } from "../../../lib/shippingApi";

const getAvailableDates = () => {
  const dates = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    let dayLabel = d
      .toLocaleDateString("en-US", { weekday: "short" })
      .toUpperCase();
    if (i === 0) dayLabel = "TODAY";
    if (i === 1) dayLabel = "TOMORROW";
    dates.push({
      day: dayLabel,
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      raw: d,
    });
  }
  return dates;
};

const WALK_IN_TIME_SLOTS = [
  "07:00 AM - 09:00 AM",
  "09:00 AM - 11:00 AM",
  "11:00 AM - 01:00 PM",
  "01:00 PM - 03:00 PM",
  "03:00 PM - 05:00 PM",
  "05:00 PM - 07:00 PM",
  "07:00 PM - 09:00 PM",
  "08:00 PM - 10:00 PM",
];

const getTomorrowDateString = () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
  const dd = String(tomorrow.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const WalkInOrderPage = () => {
  const navigate = useNavigate();
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerId, setCustomerId] = useState(null);
  const [customerAddressAuthorization, setCustomerAddressAuthorization] = useState('');
  const customerLookupRequest = useRef(0);
  const [customerName, setCustomerName] = useState("");
  const [tempName, setTempName] = useState("");
  const [otpValue, setOtpValue] = useState("");
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [showOtpField, setShowOtpField] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [items, setItems] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveServices, setLiveServices] = useState([]);
  const [showInvoice, setShowInvoice] = useState(false);
  const [createdOrder, setCreatedOrder] = useState(null);
  const [deliveryTime, setDeliveryTime] = useState("Tomorrow, 6:00 PM");
  const [quantity, setQuantity] = useState(1);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [deliveryMethod, setDeliveryMethod] = useState("self");
  const [deliveryAddress, setDeliveryAddress] = useState("");

  // Photo states
  const [itemPhotos, setItemPhotos] = useState({});
  const [activePhotoService, setActivePhotoService] = useState(null);
  const [uploading, setUploading] = useState(false);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  // Review Modal states
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [vendorAddress, setVendorAddress] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [isPromoApplied, setIsPromoApplied] = useState(false);
  const [promoError, setPromoError] = useState("");
  const [discount, setDiscount] = useState(0);

  // Category and subcategory filtering states
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState(null);

  // New Address & Maps states
  const [selectedTier, setSelectedTier] = useState("Essential");
  const [isExpress, setIsExpress] = useState(false);
  const [heritageMultiplier, setHeritageMultiplier] = useState(1);
  const [expressMultiplier, setExpressMultiplier] = useState(1);
  const [pricingFactor, setPricingFactor] = useState(1);
  const [showDeliveryTypeModal, setShowDeliveryTypeModal] = useState(false);
  const [savedCustomerAddress, setSavedCustomerAddress] = useState(null);
  const [enableDelivery, setEnableDelivery] = useState(false);
  const [showLocateModal, setShowLocateModal] = useState(false);
  const [addressDetails, setAddressDetails] = useState({
    type: "",
    flatNo: "",
    street: "",
    floor: "",
    landmark: "",
    city: "",
    state: "",
    pincode: "",
    lat: 22.7196,
    lng: 75.8577,
  });
  const [showMapModal, setShowMapModal] = useState(false);
  const [autocompleteInstance, setAutocompleteInstance] = useState(null);
  const [mapCenter, setMapCenter] = useState({ lat: 22.7196, lng: 75.8577 });
  const [markerPos, setMarkerPos] = useState({ lat: 22.7196, lng: 75.8577 });
  const [addressPreview, setAddressPreview] = useState("");
  const [tempAddressDetails, setTempAddressDetails] = useState({
    flatNo: "",
    street: "",
    city: "",
    state: "",
    pincode: "",
    lat: 22.7196,
    lng: 75.8577,
  });

  // Delivery date and time custom states
  const availableDates = useMemo(() => getAvailableDates(), []);
  const [selectedPickupDate, setSelectedPickupDate] = useState(() => {
    return `${availableDates[0].day}, ${availableDates[0].date}`;
  });
  const [selectedPickupTime, setSelectedPickupTime] = useState(() => {
    const validSlots = WALK_IN_TIME_SLOTS.filter((slot) => {
      const [timePart] = slot.split(" - ");
      const [time, modifier] = timePart.split(" ");
      let [hours] = time.split(":");
      let h = parseInt(hours, 10);
      if (h === 12) h = 0;
      if (modifier === "PM") h += 12;
      const now = new Date();
      const slotTime = new Date();
      slotTime.setHours(h, 0, 0, 0);
      return slotTime > new Date(now.getTime() + 60 * 60 * 1000);
    });
    return validSlots.length > 0
      ? validSlots[0]
      : WALK_IN_TIME_SLOTS[WALK_IN_TIME_SLOTS.length - 1];
  });
  const [selectedDeliveryDate, setSelectedDeliveryDate] = useState(() => {
    return `${availableDates[3].day}, ${availableDates[3].date}`;
  });
  const [selectedDeliveryTimeSlot, setSelectedDeliveryTimeSlot] = useState(
    "06:00 PM - 08:00 PM",
  );
  const [openDropdown, setOpenDropdown] = useState(null);

  const getSlotDateTime = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return null;
    let d;
    const parts = dateStr.split(", ");
    const datePart = parts[parts.length - 1];
    const foundDate = availableDates.find((ad) => ad.date === datePart);
    if (foundDate) {
      d = new Date(foundDate.raw);
    } else {
      d = new Date(datePart);
    }
    const [timeRange] = timeStr.split(" - ");
    const [time, modifier] = timeRange.split(" ");
    let [hours, minutes] = time.split(":");
    let h = parseInt(hours, 10);
    if (h === 12) h = 0;
    if (modifier === "PM") h += 12;
    d.setHours(h, parseInt(minutes, 10), 0, 0);
    return d;
  };

  useEffect(() => {
    if (selectedDeliveryDate && selectedDeliveryTimeSlot) {
      setDeliveryTime(`${selectedDeliveryDate}, ${selectedDeliveryTimeSlot}`);
    }
  }, [selectedDeliveryDate, selectedDeliveryTimeSlot]);

  const maxServiceTime = useMemo(() => {
    if (items.length === 0) return 1;
    return items.reduce(
      (max, item) => Math.max(max, item.completionTime || 1),
      1,
    );
  }, [items]);

  useEffect(() => {
    if (
      selectedPickupDate &&
      selectedPickupTime &&
      selectedDeliveryDate &&
      selectedDeliveryTimeSlot
    ) {
      const pDT = getSlotDateTime(selectedPickupDate, selectedPickupTime);
      const dDT = getSlotDateTime(
        selectedDeliveryDate,
        selectedDeliveryTimeSlot,
      );
      if (pDT && dDT) {
        const diffH = (dDT - pDT) / (1000 * 60 * 60);
        const minH = isExpress ? 24 : maxServiceTime * 24;
        if (diffH < minH) {
          let foundValid = false;
          for (const d of availableDates) {
            const dateStr = `${d.day}, ${d.date}`;
            for (const slot of WALK_IN_TIME_SLOTS) {
              const candidateDT = getSlotDateTime(dateStr, slot);
              if (
                candidateDT &&
                (candidateDT - pDT) / (1000 * 60 * 60) >= minH
              ) {
                setSelectedDeliveryDate(dateStr);
                setSelectedDeliveryTimeSlot(slot);
                foundValid = true;
                break;
              }
            }
            if (foundValid) break;
          }
        }
      }
    }
  }, [
    selectedPickupDate,
    selectedPickupTime,
    isExpress,
    maxServiceTime,
    availableDates,
  ]);

  // Manual Quantity Input states
  const [manualQtyService, setManualQtyService] = useState(null);
  const [manualQtyInput, setManualQtyInput] = useState("");

  // Logistic Fee states & config
  const [isCalculatingFee, setIsCalculatingFee] = useState(false);
  const [baseLogisticsFee, setBaseLogisticsFee] = useState(50);
  const [calculatedLogisticFee, setCalculatedLogisticFee] = useState(0);

  useEffect(() => {
    const fetchShippingConfig = async () => {
      try {
        const configs = await shippingConfigApi.getConfig();
        if (Array.isArray(configs)) {
          const normalFee = configs.find(
            (c) => c.key === "normal_logistics_fee",
          );
          if (normalFee && !isNaN(Number(normalFee.value))) {
            setBaseLogisticsFee(Number(normalFee.value));
          }
        }
      } catch (err) {
        console.error("Error fetching shipping config in WalkIn:", err);
      }
    };
    fetchShippingConfig();
  }, []);

  // Automatically calculate logistic fee when delivery is toggled or mode changes
  useEffect(() => {
    if (enableDelivery) {
      const fee = Math.round(
        baseLogisticsFee * (isExpress ? expressMultiplier || 1.5 : 1),
      );
      setCalculatedLogisticFee(fee > 0 ? fee : 50);
    } else {
      setCalculatedLogisticFee(0);
    }
  }, [enableDelivery, isExpress, baseLogisticsFee, expressMultiplier]);

  const isAddressComplete = useMemo(() => {
    return !!(
      addressDetails.flatNo?.trim() &&
      addressDetails.street?.trim() &&
      addressDetails.city?.trim() &&
      addressDetails.state?.trim() &&
      addressDetails.pincode?.trim()
    );
  }, [addressDetails]);

  const mapRef = useRef(null);

  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  const vendorData = JSON.parse(localStorage.getItem("vendorData") || "{}");
  const getVendorId = () => {
    const keys = ["user", "vendorData", "userData", "auth_user", "vendor"];
    for (const key of keys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        const id =
          data?._id ||
          data?.id ||
          data?.user?._id ||
          data?.user?.id ||
          data?.uid;
        if (id) return id;
      } catch (e) {
        continue;
      }
    }
    return null;
  };

  const vendorId = getVendorId();

  const fetchServices = async () => {
    if (!vendorId) {
      console.warn("WalkInHub: No vendorId found, skipping service fetch.");
      return;
    }
    try {
      // Fetch custom services, vendor profile, and master services list
      const [masterRes, profileRes, masterServices] = await Promise.all([
        serviceApi.getAll({ vendorId }),
        authApi.getProfile(vendorId),
        masterServiceApi.getAll({ limit: 10000 }),
      ]);

      if (profileRes) {
        const shopAddr =
          profileRes.shopDetails?.address || profileRes.address || "";
        setVendorAddress(shopAddr);

        try {
          const lat = profileRes.location?.lat || 22.7196;
          const lng = profileRes.location?.lng || 75.8577;
          const zoneInfo = await geofenceApi.checkAvailability(lat, lng);
          if (zoneInfo && zoneInfo.available) {
            setHeritageMultiplier(zoneInfo.heritageMultiplier || 1);
            setExpressMultiplier(zoneInfo.expressMultiplier || 1);
            setPricingFactor(zoneInfo.pricingFactor || 1);
          }
        } catch (err) {
          console.error("Error fetching zone pricing:", err);
        }
      }

      const registrationServices = profileRes.shopDetails?.services || [];

      // Filter only approved registration services
      const approvedRegistrationServices = registrationServices.filter(
        (s) => s.status === "approved",
      );

      // Build a lookup map for master services to resolve categories/subcategories
      const masterMap = new Map();
      if (Array.isArray(masterServices)) {
        masterServices.forEach((ms) => {
          masterMap.set(ms._id, ms);
        });
      }

      const mergedMap = new Map();

      // Add approved registration services to map
      approvedRegistrationServices.forEach((s) => {
        const id = s.id || s._id;
        const master = masterMap.get(id);
        mergedMap.set(id, {
          ...s,
          id: id,
          _id: id,
          name: s.name || master?.itemName || master?.name || "Unnamed Service",
          isFromRegistration: true,
          approvalStatus: "Approved",
          active: s.active ?? true,
          basePrice: master?.basePrice || s.basePrice || s.vendorRate || 0,
          mainCategory: master?.categoryId?.mainCategory || "Dry Cleaning",
          subCategory: master?.categoryId?.subCategory || "General",
          tier:
            s.tier || master?.tier || master?.categoryId?.tier || "Essential",
          completionTime: s.completionTime || master?.completionTime || 1,
        });
      });

      // Add custom services to map (overwriting/merging duplicates)
      masterRes.forEach((s) => {
        const id = s._id || s.id;
        const master = masterMap.get(id);
        mergedMap.set(id, {
          ...s,
          id: id,
          _id: id,
          name: s.name || master?.itemName || master?.name || "Unnamed Service",
          isFromRegistration: false,
          approvalStatus: s.approvalStatus || "Pending",
          active: s.status === "Active",
          basePrice: master?.basePrice || s.basePrice || 0,
          mainCategory:
            s.category || master?.categoryId?.mainCategory || "Custom",
          subCategory: master?.categoryId?.subCategory || "General",
          tier:
            s.tier || master?.tier || master?.categoryId?.tier || "Essential",
          completionTime: s.completionTime || master?.completionTime || 1,
        });
      });

      setLiveServices(Array.from(mergedMap.values()));
    } catch (error) {
      console.error("Fetch Services Error:", error);
    }
  };

  useEffect(() => {
    if (vendorId) {
      fetchServices();
    }
  }, [vendorId]);

  const services = useMemo(() => {
    return liveServices
      .filter((s) => s.active && s.approvalStatus === "Approved")
      .filter((s) => {
        const serviceTier = s.tier || "Essential";
        if (serviceTier === "Heritage" && selectedTier !== "Heritage")
          return false;
        return true;
      })
      .map((s) => {
        const serviceTier = s.tier || "Essential";
        const isServiceHeritage = serviceTier === "Heritage";
        const applyHeritageMultiplier =
          selectedTier === "Heritage" && !isServiceHeritage;

        return {
          serviceId: s._id || s.id,
          title: s.name,
          price: Math.round(
            (s.basePrice || 0) *
              pricingFactor *
              (applyHeritageMultiplier ? heritageMultiplier : 1) *
              (isExpress ? expressMultiplier : 1),
          ),
          icon: s.icon || "local_laundry_service",
          category: s.mainCategory || "Custom",
          subCategory: s.subCategory || "General",
          tier: serviceTier,
          completionTime: s.completionTime || 1,
        };
      });
  }, [
    liveServices,
    selectedTier,
    heritageMultiplier,
    isExpress,
    expressMultiplier,
    pricingFactor,
  ]);

  // Unique Categories memo derived from active services
  const uniqueCategories = useMemo(() => {
    const cats = new Set();
    services.forEach((s) => {
      if (s.category) cats.add(s.category);
    });
    return Array.from(cats);
  }, [services]);

  // Unique Subcategories memo derived from active services in the selected category
  const uniqueSubCategories = useMemo(() => {
    if (!selectedCategory) return [];
    const subs = new Set();
    services.forEach((s) => {
      if (s.category === selectedCategory && s.subCategory) {
        subs.add(s.subCategory);
      }
    });
    return Array.from(subs);
  }, [services, selectedCategory]);

  // Filtered services depending on selected category and subcategory
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      if (selectedCategory && s.category !== selectedCategory) return false;
      if (selectedSubCategory && s.subCategory !== selectedSubCategory)
        return false;
      return true;
    });
  }, [services, selectedCategory, selectedSubCategory]);

  // Automatically select the first category if none is selected
  useEffect(() => {
    if (uniqueCategories.length > 0 && !selectedCategory) {
      setSelectedCategory(uniqueCategories[0]);
    }
  }, [uniqueCategories, selectedCategory]);

  const handleCategoryClick = (cat) => {
    if (selectedCategory === cat) {
      setSelectedCategory(null);
      setSelectedSubCategory(null);
    } else {
      setSelectedCategory(cat);
      setSelectedSubCategory(null);
    }
  };

  const handleSubCategoryClick = (sub) => {
    if (selectedSubCategory === sub) {
      setSelectedSubCategory(null);
    } else {
      setSelectedSubCategory(sub);
    }
  };

  // Automatically reset verification status and address details if phone is edited
  useEffect(() => {
    setIsVerified(false);
    setShowOtpField(false);
    setOtpValue("");
    setCustomerName("");
    setEnableDelivery(false);
    setAddressDetails({
      flatNo: "",
      street: "",
      city: "",
      state: "",
      pincode: "",
      lat: 22.7196,
      lng: 75.8577,
    });
  }, [customerPhone]);

  // Automatically reset verification status if name is edited - REMOVED to prevent resetting when lookup auto-fills name.

  // Sync enableDelivery and addressDetails to checkout states
  useEffect(() => {
    if (enableDelivery) {
      setDeliveryMethod("shiprocket");
      const addrParts = [
        addressDetails.flatNo,
        addressDetails.street,
        addressDetails.city,
        addressDetails.state,
        addressDetails.pincode ? `PIN-${addressDetails.pincode}` : "",
      ].filter((p) => p && p.trim() !== "");
      setDeliveryAddress(addrParts.join(", "));
    } else {
      setDeliveryMethod("self");
      setDeliveryAddress("");
    }
  }, [enableDelivery, addressDetails]);

  // Map Modal setup effect
  useEffect(() => {
    if (showMapModal) {
      const initialLat =
        addressDetails.lat || vendorData.location?.lat || 22.7196;
      const initialLng =
        addressDetails.lng || vendorData.location?.lng || 75.8577;
      const initialPos = { lat: initialLat, lng: initialLng };
      setMarkerPos(initialPos);
      setMapCenter(initialPos);

      const currentPreview = [
        addressDetails.flatNo,
        addressDetails.street,
        addressDetails.city,
        addressDetails.state,
        addressDetails.pincode,
      ]
        .filter((p) => p && p.trim() !== "")
        .join(", ");
      setAddressPreview(
        currentPreview || "Drag marker or search to see address preview...",
      );
      setTempAddressDetails({
        ...addressDetails,
        lat: initialLat,
        lng: initialLng,
      });
    }
  }, [showMapModal]);

  const handlePlaceChanged = () => {
    if (!autocompleteInstance) return;
    const place = autocompleteInstance.getPlace();
    if (place.geometry) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      const newPos = { lat, lng };
      setMarkerPos(newPos);
      setMapCenter(newPos);

      // Extract components
      let street = "";
      let city = "";
      let state = "";
      let pincode = "";

      if (place.address_components) {
        const streetNumberComp = place.address_components.find((c) =>
          c.types.includes("street_number"),
        );
        const routeComp = place.address_components.find((c) =>
          c.types.includes("route"),
        );
        const sublocalityComp = place.address_components.find((c) =>
          c.types.includes("sublocality_level_1"),
        );
        const neighborhoodComp = place.address_components.find((c) =>
          c.types.includes("neighborhood"),
        );

        const parts = [
          streetNumberComp?.long_name,
          routeComp?.long_name,
          sublocalityComp?.long_name,
          neighborhoodComp?.long_name,
        ].filter(Boolean);

        street = parts.join(", ") || place.name || "";

        const cityComp = place.address_components.find(
          (c) =>
            c.types.includes("locality") ||
            c.types.includes("administrative_area_level_2"),
        );
        city = cityComp ? cityComp.long_name : "";

        const stateComp = place.address_components.find((c) =>
          c.types.includes("administrative_area_level_1"),
        );
        state = stateComp ? stateComp.long_name : "";

        const pinComp = place.address_components.find((c) =>
          c.types.includes("postal_code"),
        );
        pincode = pinComp ? pinComp.long_name : "";
      }

      setTempAddressDetails({
        flatNo: "",
        street: street,
        city: city,
        state: state,
        pincode: pincode,
        lat,
        lng,
      });
      setAddressPreview(place.formatted_address || "");
    }
  };

  const handleMarkerDragEnd = async (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    const newPos = { lat, lng };
    setMarkerPos(newPos);

    try {
      const addressData = await locationService.reverseGeocode(lat, lng);
      setTempAddressDetails({
        flatNo: addressDetails.flatNo || addressData.subLocal || "",
        street: addressData.area || addressData.fullAddress || "",
        city: addressData.city || "",
        state: addressData.state || "",
        pincode: addressData.pincode || "",
        lat,
        lng,
      });
      setAddressPreview(addressData.fullAddress);
    } catch (error) {
      console.error("Reverse Geocode Error:", error);
    }
  };

  const confirmMapLocation = () => {
    setAddressDetails(tempAddressDetails);
    setShowMapModal(false);
    toast.success("Location updated!");
  };

  const handlePhoneChange = async (val) => {
    const request = ++customerLookupRequest.current;
    setCustomerAddressAuthorization('');
    const cleanVal = val.replace(/\D/g, "");
    if (cleanVal.length <= 10) {
      setCustomerPhone(cleanVal);
      if (cleanVal.length === 10) {
        try {
          const lookupRes = await authApi.lookupPhone(cleanVal);
          if (request !== customerLookupRequest.current) return;
          if (lookupRes && lookupRes.isRegistered) {
            const dispName = lookupRes.displayName || "";
            setTempName(dispName);
            setCustomerName(dispName);
            setIsVerified(true);
            setCustomerId(lookupRes.id || null);
            setCustomerAddressAuthorization(lookupRes.addressUpdateToken || '');

            let rawAddress = lookupRes.address || "";
            let cCity = lookupRes.city || "";
            let cState = lookupRes.state || "";
            let cPincode = lookupRes.pincode || "";
            let cFlatNo = "";
            let cStreet = rawAddress;

            // Try to parse rawAddress if it contains commas and city/pincode are missing
            if (rawAddress && (!cCity || !cPincode)) {
              const parts = rawAddress.split(",").map((s) => s.trim());
              if (parts.length >= 3) {
                const lastPart = parts.pop();
                const pinMatch = lastPart.match(/\d{6}/);
                if (pinMatch) cPincode = pinMatch[0];

                cCity = parts.pop();
                cStreet = parts.join(", ");
              }
            } else if (rawAddress && cCity && cStreet.includes(cCity)) {
              // remove city and everything after it from street to avoid duplication
              const cityIdx = cStreet.lastIndexOf(cCity);
              if (cityIdx > 0) {
                cStreet = cStreet
                  .substring(0, cityIdx)
                  .replace(/,\s*$/, "")
                  .trim();
              }
            }

            // Attempt to extract flat number if there are still multiple parts
            const streetParts = cStreet.split(",");
            if (streetParts.length > 1 && streetParts[0].length < 20) {
              cFlatNo = streetParts[0].trim();
              cStreet = streetParts.slice(1).join(", ").trim();
            }

            setSavedCustomerAddress({
              type: lookupRes.type || "Home",
              flatNo: cFlatNo,
              street: cStreet,
              city: cCity,
              state: cState,
              pincode: cPincode,
              lat: lookupRes.lat,
              lng: lookupRes.lng,
            });
            setEnableDelivery(true);
            setAddressDetails({
              type: lookupRes.type ? lookupRes.type.toUpperCase() : "HOME",
              flatNo: cFlatNo || "",
              street: cStreet || "",
              city: cCity || "",
              state: cState || "",
              pincode: cPincode || "",
              lat: lookupRes.lat || 22.7196,
              lng: lookupRes.lng || 75.8577,
            });
            toast.success(`Welcome back, ${dispName || "Customer"}!`);
          } else if (lookupRes && lookupRes.displayName) {
            setTempName(lookupRes.displayName);
            setIsVerified(false);
            setSavedCustomerAddress(null);
            setCustomerId(null);
          } else {
            setTempName("");
            setIsVerified(false);
            setSavedCustomerAddress(null);
            setCustomerId(null);
          }
        } catch (err) {
          if (request !== customerLookupRequest.current) return;
          console.error("Lookup Phone Error:", err);
          if (
            err.message &&
            (err.message.includes("registered as a") ||
              err.message.includes("Only Customer"))
          ) {
            toast.error(err.message);
            setCustomerPhone("");
          } else {
            console.log("Customer not previously registered under this phone.");
          }
          setTempName("");
          setIsVerified(false);
          setSavedCustomerAddress(null);
          setCustomerId(null);
        }
      } else {
        setIsVerified(false);
        setCustomerId(null);
        setSavedCustomerAddress(null);
        setTempName("");
        setCustomerName("");
      }
    }
  };

  const handleSendOtpInline = async () => {
    if (!customerPhone || customerPhone.length !== 10) {
      toast.error("Please enter a valid 10-digit mobile number");
      return;
    }
    if (!tempName.trim()) {
      toast.error("Please enter customer name");
      return;
    }
    setIsSendingOtp(true);
    try {
      await authApi.requestOtp(customerPhone, "WhatsApp", undefined, {
        role: "Customer",
        name: tempName.trim(),
      });
      toast.success("OTP sent to customer's mobile number!");
      setOtpValue("");
      setShowOtpField(true);
    } catch (err) {
      console.error("Request OTP Error:", err);
      toast.error("Failed to send OTP. Please try again.");
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtpInline = async () => {
    if (!otpValue || otpValue.length < 6) {
      toast.error("Please enter 6-digit OTP code");
      return;
    }
    setIsVerifyingOtp(true);
    try {
      const res = await authApi.verifyOtp(customerPhone, otpValue);
      if (res && (res.token || res.message === "OTP verified successfully")) {
        setCustomerName(tempName.trim());
        setIsVerified(true);
        setShowOtpField(false);
        setCustomerId(res.user?._id || res.user?.id || null);
        const addressAccess = await authApi.lookupPhone(customerPhone);
        setCustomerAddressAuthorization(addressAccess.addressUpdateToken || '');
        toast.success(`Customer verified: ${tempName.trim()}`);
      } else {
        toast.error(res.message || "Verification failed");
      }
    } catch (err) {
      console.error("OTP Verification Error:", err);
      toast.error(err.message || "Invalid or expired OTP. Please try again.");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handlePhotoFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0 || !activePhotoService) return;

    setUploading(true);
    try {
      const uploadedUrls = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append("media", file);
        const res = await mediaApi.upload(formData);
        if (res.url) {
          uploadedUrls.push(res.url);
        }
      }

      setItemPhotos((prev) => ({
        ...prev,
        [activePhotoService.id]: [
          ...(prev[activePhotoService.id] || []),
          ...uploadedUrls,
        ],
      }));

      toast.success("Photos uploaded successfully!");
    } catch (error) {
      console.error("Upload Error:", error);
      toast.error("Failed to upload photos");
    } finally {
      setUploading(false);
      e.target.value = ""; // Reset input
    }
  };

  const handleDeletePhoto = (serviceId, photoUrl) => {
    setItemPhotos((prev) => ({
      ...prev,
      [serviceId]: (prev[serviceId] || []).filter((url) => url !== photoUrl),
    }));
    toast.success("Photo removed");
  };

  const handleApplyPromo = async () => {
    if (!promoCode || !promoCode.trim()) return;
    try {
      const res = await promotionApi.validate({
        code: promoCode.trim(),
        vendorId,
        orderValue: total,
      });
      if (res.message) {
        setPromoError(res.message);
        setIsPromoApplied(false);
        setDiscount(0);
        toast.error(res.message);
      } else {
        const dType = res.discountType || res.discount_type;
        const dVal =
          Number(
            res.discountValue !== undefined
              ? res.discountValue
              : res.discount_value,
          ) || 0;
        const calcDiscount =
          dType === "Flat" || dType === "FLAT_AMOUNT"
            ? dVal
            : Math.round((total * dVal) / 100);
        const finalDiscount = Math.min(total, calcDiscount);

        setIsPromoApplied(true);
        setPromoError("");
        setDiscount(finalDiscount);
        toast.success(`Promo applied! ₹${finalDiscount} discount`);
      }
    } catch (err) {
      const msg = err.message || "Invalid or expired code";
      setPromoError(msg);
      setIsPromoApplied(false);
      setDiscount(0);
      toast.error(msg);
    }
  };

  const getServiceQty = (serviceId) => {
    return items
      .filter((item) => item.serviceId === serviceId)
      .reduce((sum, item) => sum + item.quantity, 0);
  };

  const updateServiceQty = (service, change) => {
    const serviceId = service.serviceId;
    const currentItems = [...items];
    const existingIndex = currentItems.findIndex(
      (item) => item.serviceId === serviceId,
    );

    if (change === 1) {
      if (existingIndex > -1) {
        currentItems[existingIndex].quantity += 1;
        setItems(currentItems);
        toast.success(`Incremented quantity of ${service.title}`);
      } else {
        const newItem = {
          serviceId: serviceId,
          title: service.title,
          price: service.price,
          icon: service.icon,
          category: service.category,
          subCategory: service.subCategory,
          id: Date.now(),
          quantity: 1,
          completionTime: service.completionTime || 1,
          tag: `T-${Math.floor(1000 + Math.random() * 9000)}`,
        };
        setItems([...currentItems, newItem]);
        toast.success(`Added ${service.title} to queue`);
      }
    } else if (change === -1) {
      if (existingIndex > -1) {
        if (currentItems[existingIndex].quantity > 1) {
          currentItems[existingIndex].quantity -= 1;
          setItems(currentItems);
          toast.success(`Decremented quantity of ${service.title}`);
        } else {
          setItems(currentItems.filter((item) => item.serviceId !== serviceId));
          setItemPhotos((prev) => {
            const { [serviceId]: _, ...rest } = prev;
            return rest;
          });
          toast.success(`Removed ${service.title} from queue`);
        }
      }
    }
  };

  const setServiceQty = (service, newQty) => {
    const serviceId = service.serviceId;
    const currentItems = [...items];
    const existingIndex = currentItems.findIndex(
      (item) => item.serviceId === serviceId,
    );

    if (newQty <= 0) {
      if (existingIndex > -1) {
        setItems(currentItems.filter((item) => item.serviceId !== serviceId));
        setItemPhotos((prev) => {
          const { [serviceId]: _, ...rest } = prev;
          return rest;
        });
        toast.success(`Removed ${service.title} from queue`);
      }
      return;
    }

    if (existingIndex > -1) {
      currentItems[existingIndex].quantity = newQty;
      setItems(currentItems);
      toast.success(`Updated quantity of ${service.title}`);
    } else {
      const newItem = {
        serviceId: serviceId,
        title: service.title,
        price: service.price,
        icon: service.icon,
        category: service.category,
        subCategory: service.subCategory,
        id: Date.now(),
        quantity: newQty,
        completionTime: service.completionTime || 1,
        tag: `T-${Math.floor(1000 + Math.random() * 9000)}`,
      };
      setItems([...currentItems, newItem]);
      toast.success(`Added ${service.title} with quantity ${newQty}`);
    }
  };

  useEffect(() => {
    if (selectedService) {
      const qty = getServiceQty(selectedService.serviceId);
      setQuantity(qty > 0 ? qty : 1);
    }
  }, [selectedService, items]);

  const total = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  const handleCollectAndPrint = async (razorpayPaymentId = null) => {
    if (!customerPhone || items.length === 0) return;

    if (enableDelivery && !isAddressComplete) {
      toast.error("Please complete the delivery address");
      setShowReviewModal(false);
      setShowLocateModal(true);
      return;
    }

    setIsProcessing(true);
    try {
      const allPhotos = [];
      items.forEach((item) => {
        const photos = itemPhotos[item.serviceId] || [];
        allPhotos.push(...photos);
      });
      const uniquePhotos = Array.from(new Set(allPhotos));

      const finalPrice = Math.max(
        0,
        total +
          (enableDelivery ? calculatedLogisticFee : 0) +
          Math.round(total * 0.05) -
          discount,
      );
      const dropAddressStr = enableDelivery
        ? `${addressDetails.flatNo}, ${addressDetails.street}, ${addressDetails.city}, ${addressDetails.state} - ${addressDetails.pincode}`
        : "Self Delivery / Customer";

      const orderData = {
        customerPhone,
        customerName,
        vendorId,
        orderType: "Walk-In",
        riderDropOff: enableDelivery,
        deliveryMode: enableDelivery
          ? isExpress
            ? "Express"
            : "Normal"
          : "Normal",
        tier: selectedTier,
        dropAddress: dropAddressStr,
        deliveryTime: enableDelivery ? deliveryTime : "N/A",
        addressDetails: enableDelivery ? addressDetails : null,
        items: items.map((i) => ({
          serviceId: i.serviceId,
          name: i.title,
          price: i.price,
          quantity: i.quantity,
          photos: itemPhotos[i.serviceId] || [],
        })),
        totalAmount: finalPrice,
        status: "PROCESSING",
        customerPhotos: uniquePhotos,
        deliveryCharge: enableDelivery ? calculatedLogisticFee : 0,
        logisticPaymentStatus: enableDelivery ? "Paid Online" : "N/A",
        logisticPaymentId: razorpayPaymentId,
        discountAmount: discount,
        promoApplied: isPromoApplied ? promoCode : null,
      };

      const response = await orderApi.createWalkInOrder(orderData);
      setCreatedOrder(response);
      setShowReviewModal(false);

      toast.success("Order Started Successfully!");
      navigate("/vendor/dashboard", { state: { initialTab: "In Progress" } });
    } catch (err) {
      console.error("Walk-In Creation Failure:", err);
      toast.error("Failed to generate order");
    } finally {
      setIsProcessing(false);
    }
  };

  if (showReviewModal) {
    const fullDropAddress =
      [
        addressDetails.flatNo,
        addressDetails.floor ? `Floor ${addressDetails.floor}` : "",
        addressDetails.street,
        addressDetails.landmark ? `Near ${addressDetails.landmark}` : "",
        addressDetails.city,
        addressDetails.state,
      ]
        .filter(Boolean)
        .join(", ") +
      (addressDetails.pincode ? ` - ${addressDetails.pincode}` : "");

    const netPayable = Math.max(
      0,
      total +
        (enableDelivery ? calculatedLogisticFee : 0) +
        Math.round(total * 0.05) -
        discount,
    );

    return (
      <div className="bg-slate-50 min-h-[100dvh] text-slate-900 font-sans pb-36">
        <div className="max-w-xl mx-auto px-4 sm:px-6 pt-6 pb-28 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => setShowReviewModal(false)}
                className="w-10 h-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-600 hover:text-slate-900 hover:border-slate-300 shadow-xs transition-all">
                <span className="material-symbols-outlined text-lg">
                  arrow_back
                </span>
              </motion.button>
              <div>
                <h1 className="text-lg font-black tracking-tight text-slate-900">
                  Review Walk-In Order
                </h1>
                <p className="text-xs text-slate-500 font-medium">
                  Verify customer, delivery mode, and service charges
                </p>
              </div>
            </div>
            <span className="bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full shadow-xs">
              Walk-In
            </span>
          </div>

          {/* Order Details & Logistics Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-xs">
                  <span className="material-symbols-outlined text-base">
                    person
                  </span>
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-black text-slate-900">
                      {customerName || "Walk-In Customer"}
                    </span>
                    <span className="material-symbols-outlined text-emerald-600 text-sm">
                      verified
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium">
                    +91 {customerPhone}
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${selectedTier === "Heritage" ? "bg-amber-50 text-amber-800 border border-amber-200" : "bg-slate-100 text-slate-700"}`}>
                {selectedTier} Tier
              </span>
            </div>

            {/* Logistics info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Store / Pickup */}
              <div className="bg-slate-50 rounded-2xl p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="material-symbols-outlined text-sm">
                    storefront
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    Pickup Location
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-800 truncate">
                  {vendorData.displayName || "Official Store Hub"}
                </p>
                <p className="text-[11px] text-slate-400">
                  Walk-In Intake at Counter
                </p>
              </div>

              {/* Dropoff / Delivery */}
              <div className="bg-slate-50 rounded-2xl p-3.5 space-y-1">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <span className="material-symbols-outlined text-sm">
                    {enableDelivery ? "local_shipping" : "shopping_bag"}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    {enableDelivery
                      ? isExpress
                        ? "Express Delivery"
                        : "Rider Delivery"
                      : "Store Self-Pickup"}
                  </span>
                </div>
                {enableDelivery ? (
                  <>
                    <p className="text-xs font-bold text-slate-800 line-clamp-1">
                      {fullDropAddress || "Address on record"}
                    </p>
                    <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">
                        schedule
                      </span>
                      {deliveryTime}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-800">
                      Customer Collects in Store
                    </p>
                    <p className="text-[11px] text-slate-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">
                        schedule
                      </span>
                      Ready by: {deliveryTime}
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Services Breakdown List */}
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                Services Breakdown
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                {items.reduce((s, i) => s + i.quantity, 0)} Items
              </span>
            </div>
            <div className="divide-y divide-slate-50">
              {items.map((item, idx) => {
                const photos = itemPhotos[item.serviceId] || [];
                return (
                  <div
                    key={item.id || idx}
                    className="py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-700 font-black text-xs shrink-0">
                        #{idx + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {item.title}
                          </p>
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-bold text-[9px]">
                            {item.quantity}x
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-400 font-medium tracking-wide">
                            Tag: {item.tag}
                          </span>
                          {photos.length > 0 && (
                            <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                              <span className="material-symbols-outlined text-xs">
                                photo_camera
                              </span>
                              {photos.length}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-black text-slate-900">
                        ₹{(item.price * item.quantity).toFixed(0)}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        ₹{item.price} each
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Promo Code Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
            <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Promotional Discount
            </span>
            {isPromoApplied ? (
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 px-4 py-3 rounded-2xl">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-600 text-base">
                    sell
                  </span>
                  <div>
                    <p className="text-xs font-black text-emerald-900">
                      {promoCode} Applied
                    </p>
                    <p className="text-[10px] text-emerald-600 font-medium">
                      Saved ₹{discount} on this order
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsPromoApplied(false);
                    setPromoCode("");
                    setDiscount(0);
                  }}
                  className="text-xs font-bold text-rose-500 hover:text-rose-700">
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-base">
                    sell
                  </span>
                  <input
                    type="text"
                    placeholder="Enter promo coupon code"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-200 pl-10 pr-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider outline-none focus:bg-white focus:border-slate-400 transition-all"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleApplyPromo}
                  disabled={!promoCode.trim()}
                  className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-800 disabled:opacity-40 transition-colors">
                  Apply
                </button>
              </div>
            )}
            {promoError && (
              <p className="text-[11px] text-rose-500 font-medium">
                {promoError}
              </p>
            )}
          </div>

          {/* Bill Breakdown Card */}
          <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-3">
            <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Bill Summary
            </span>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Services Subtotal</span>
                <span className="font-bold text-slate-900">
                  ₹{total.toFixed(0)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Platform Fee</span>
                <span className="font-bold text-emerald-600">FREE</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Logistics / Delivery</span>
                <span className="font-bold text-slate-900">
                  {enableDelivery
                    ? `₹${calculatedLogisticFee}`
                    : "FREE (Self-Pickup)"}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Estimated GST (5%)</span>
                <span className="font-bold text-slate-900">
                  ₹{Math.round(total * 0.05)}
                </span>
              </div>
              {isPromoApplied && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Discount ({promoCode})</span>
                  <span className="font-bold">-₹{discount}</span>
                </div>
              )}
              <div className="pt-2 border-t border-slate-100 flex justify-between items-baseline">
                <div>
                  <span className="text-sm font-black text-slate-900">
                    Total Payable
                  </span>
                  <p className="text-[10px] text-slate-400">
                    Inclusive of all taxes
                  </p>
                </div>
                <span className="text-2xl font-black text-slate-900 tracking-tight">
                  ₹{netPayable.toFixed(0)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Bottom Action */}
        <div className="fixed bottom-16 left-0 right-0 p-4 bg-white/90 backdrop-blur-lg border-t border-slate-200/80 z-40">
          <div className="max-w-xl mx-auto flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Net Amount
              </p>
              <p className="text-xl font-black text-slate-900">
                ₹{netPayable.toFixed(0)}
              </p>
            </div>
            {enableDelivery && calculatedLogisticFee > 0 ? (
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={async () => {
                  if (enableDelivery && !isAddressComplete) {
                    toast.error("Please complete the delivery address");
                    setShowReviewModal(false);
                    setShowLocateModal(true);
                    return;
                  }

                  const loadScript = (src) => {
                    return new Promise((resolve) => {
                      if (window.Razorpay) {
                        resolve(true);
                        return;
                      }
                      const script = document.createElement("script");
                      script.src = src;
                      script.onload = () => resolve(true);
                      script.onerror = () => resolve(false);
                      document.body.appendChild(script);
                    });
                  };

                  const loaded = await loadScript(
                    "https://checkout.razorpay.com/v1/checkout.js",
                  );
                  if (!loaded) {
                    toast.error("Razorpay SDK failed to load");
                    return;
                  }

                  setIsProcessing(true);
                  const rzpToast = toast.loading("Initiating Payment...");
                  try {
                    const rzpOrder = await orderApi.createRazorpayOrder({
                      amount: calculatedLogisticFee,
                    });

                    toast.dismiss(rzpToast);

                    if (!rzpOrder || !rzpOrder.id) {
                      toast.error("Failed to create payment order");
                      setIsProcessing(false);
                      return;
                    }

                    const options = {
                      key: rzpOrder.keyId,
                      amount: rzpOrder.amount,
                      currency: rzpOrder.currency,
                      name: "EzOfLife",
                      description: `Walk-In Order Logistic Fee`,
                      order_id: rzpOrder.id,
                      handler: async function (response) {
                        toast.success("Payment Received!");
                        await handleCollectAndPrint(
                          response.razorpay_payment_id,
                        );
                      },
                      prefill: {
                        name: customerName || "",
                        contact: customerPhone || "",
                      },
                      theme: { color: "#0f172a" },
                      modal: {
                        ondismiss: function () {
                          setIsProcessing(false);
                        },
                      },
                    };

                    const paymentObject = new window.Razorpay(options);
                    paymentObject.open();
                  } catch {
                    toast.dismiss(rzpToast);
                    toast.error("Payment initiation failed");
                    setIsProcessing(false);
                  }
                }}
                disabled={isProcessing}
                className="flex-1 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg hover:bg-slate-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer">
                {isProcessing ? (
                  <>
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{
                        repeat: Infinity,
                        duration: 1,
                        ease: "linear",
                      }}
                      className="material-symbols-outlined text-sm">
                      autorenew
                    </motion.span>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-sm">
                      payment
                    </span>
                    <span>
                      Pay Logistic Fee (₹{calculatedLogisticFee}) & Book
                    </span>
                  </>
                )}
              </motion.button>
            ) : (
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                type="button"
                onClick={() => handleCollectAndPrint()}
                disabled={isProcessing}
                className="flex-1 py-3.5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg hover:bg-slate-800 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer">
                {isProcessing ? (
                  <>
                    <motion.span
                      animate={{ rotate: 360 }}
                      transition={{
                        repeat: Infinity,
                        duration: 1,
                        ease: "linear",
                      }}
                      className="material-symbols-outlined text-sm">
                      autorenew
                    </motion.span>
                    <span>Creating Order...</span>
                  </>
                ) : (
                  <>
                    <span>
                      {enableDelivery
                        ? "Confirm & Book (Free Delivery)"
                        : "Confirm & Generate Order"}
                    </span>
                    <span className="material-symbols-outlined text-sm">
                      arrow_forward
                    </span>
                  </>
                )}
              </motion.button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="text-slate-900 min-h-[100dvh] pb-36 flex flex-col font-sans bg-slate-50/50 overflow-x-hidden">
      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 space-y-5 flex-1 w-full">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-900 hover:border-slate-300 shadow-xs transition-all">
              <span className="material-symbols-outlined text-lg">
                arrow_back
              </span>
            </button>
            <div>
              <h1 className="text-lg font-black tracking-tight text-slate-900">
                Take Customer Order
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Direct in-store counter order intake
              </p>
            </div>
          </div>
          <span className="bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border border-slate-200">
            Counter Mode
          </span>
        </header>

        {/* 1. Customer Section */}
        <section className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-700">
                1
              </span>
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Customer Verification
              </h2>
            </div>
            {isVerified && (
              <span className="bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">
                  verified
                </span>
                Verified
              </span>
            )}
          </div>

          {!isVerified ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Phone Input */}
                <div className="relative">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Mobile Number
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-base">
                      phone_iphone
                    </span>
                    <input
                      type="tel"
                      placeholder="10-digit number"
                      value={customerPhone}
                      onChange={(e) => handlePhoneChange(e.target.value)}
                      maxLength={10}
                      className="w-full bg-slate-50 rounded-2xl pl-10 pr-4 py-3 text-xs font-bold border border-slate-200/80 outline-none focus:bg-white focus:border-slate-400 transition-all"
                    />
                  </div>
                </div>

                {/* Name Input */}
                <div
                  className={`relative transition-all duration-200 ${customerPhone.length !== 10 ? "opacity-50 pointer-events-none" : ""}`}>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Customer Name
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-base">
                      person
                    </span>
                    <input
                      type="text"
                      placeholder="Enter full name"
                      value={tempName}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^A-Za-z\s]/g, "");
                        setTempName(val);
                      }}
                      disabled={customerPhone.length !== 10}
                      className="w-full bg-slate-50 rounded-2xl pl-10 pr-4 py-3 text-xs font-bold border border-slate-200/80 outline-none focus:bg-white focus:border-slate-400 transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Send Verification OTP Button */}
              {customerPhone.length === 10 &&
                tempName.trim() &&
                !showOtpField && (
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSendOtpInline}
                    disabled={isSendingOtp}
                    className="w-full py-3 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded-2xl shadow-sm hover:bg-slate-800 transition-colors flex items-center justify-center gap-2">
                    {isSendingOtp ? (
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{
                          repeat: Infinity,
                          duration: 1,
                          ease: "linear",
                        }}
                        className="material-symbols-outlined text-base">
                        autorenew
                      </motion.span>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-base">
                          sms
                        </span>
                        <span>Send Customer OTP</span>
                      </>
                    )}
                  </motion.button>
                )}

              {/* Inline OTP Input */}
              {showOtpField && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <input
                      type="text"
                      placeholder="ENTER OTP"
                      value={otpValue}
                      onChange={(e) =>
                        setOtpValue(
                          e.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      className="flex-1 sm:w-36 px-4 py-2.5 bg-white rounded-xl text-xs font-black text-slate-900 text-center tracking-[0.4em] border border-slate-200 outline-none focus:border-slate-400"
                    />
                    <button
                      onClick={handleSendOtpInline}
                      className="p-2.5 bg-white border border-slate-200 text-slate-400 hover:text-slate-900 rounded-xl transition-colors shrink-0"
                      title="Resend OTP">
                      <span className="material-symbols-outlined text-base">
                        refresh
                      </span>
                    </button>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={handleVerifyOtpInline}
                    disabled={isVerifyingOtp || otpValue.length < 4}
                    className="w-full sm:w-auto px-6 py-2.5 bg-slate-900 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-xs hover:bg-slate-800 disabled:opacity-40 transition-all flex items-center justify-center">
                    {isVerifyingOtp ? "Verifying..." : "Verify OTP"}
                  </motion.button>
                </motion.div>
              )}
            </div>
          ) : (
            /* Verified Customer Card */
            <div className="flex items-center justify-between bg-slate-50 border border-slate-100 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-black text-sm">
                  {customerName ? customerName.charAt(0).toUpperCase() : "C"}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-black text-slate-900">
                      {customerName}
                    </span>
                    <span className="material-symbols-outlined text-emerald-600 text-xs">
                      verified
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium">
                    +91 {customerPhone}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setCustomerPhone("");
                  setTempName("");
                  setCustomerName("");
                  setIsVerified(false);
                  setCustomerId(null);
                  setSavedCustomerAddress(null);
                }}
                className="text-[11px] font-black text-slate-400 hover:text-rose-600 transition-colors uppercase tracking-wider">
                Switch
              </button>
            </div>
          )}
        </section>

        {/* 2. Order Mode & Logistics Options */}
        <section
          className={`bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4 transition-all duration-300 ${!isVerified ? "opacity-40 pointer-events-none" : ""}`}>
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-700">
              2
            </span>
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
              Service Tier & Delivery Logistics
            </h2>
          </div>

          <div className="space-y-4">
            {/* Tier Selection */}
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Service Quality Tier
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setSelectedTier("Essential")}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${selectedTier === "Essential" ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-slate-50 text-slate-700 border-slate-200/80 hover:bg-slate-100"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black uppercase tracking-wider">
                      Essential
                    </span>
                    {selectedTier === "Essential" && (
                      <span className="material-symbols-outlined text-sm">
                        check_circle
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-[10px] leading-tight ${selectedTier === "Essential" ? "text-slate-300" : "text-slate-500"}`}>
                    Standard care for everyday garments
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTier("Heritage")}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${selectedTier === "Heritage" ? "bg-amber-900 text-white border-amber-900 shadow-md" : "bg-slate-50 text-slate-700 border-slate-200/80 hover:bg-slate-100"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-black uppercase tracking-wider">
                      Heritage
                    </span>
                    {selectedTier === "Heritage" && (
                      <span className="material-symbols-outlined text-sm">
                        check_circle
                      </span>
                    )}
                  </div>
                  <p
                    className={`text-[10px] leading-tight ${selectedTier === "Heritage" ? "text-amber-200" : "text-slate-500"}`}>
                    Premium care for delicate & designer wear
                  </p>
                </button>
              </div>
            </div>

            {/* Drop-off Delivery Toggle */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Rider Drop-off Delivery
                  </span>
                  <p className="text-[11px] text-slate-500">
                    Deliver finished laundry to customer's doorstep
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!enableDelivery) {
                      setEnableDelivery(true);
                      if (
                        savedCustomerAddress &&
                        (savedCustomerAddress.street ||
                          savedCustomerAddress.flatNo)
                      ) {
                        setAddressDetails((prev) => ({
                          ...prev,
                          type: savedCustomerAddress.type
                            ? savedCustomerAddress.type.toUpperCase()
                            : "HOME",
                          flatNo: savedCustomerAddress.flatNo || "",
                          street: savedCustomerAddress.street || "",
                          city: savedCustomerAddress.city || "",
                          state: savedCustomerAddress.state || "",
                          pincode: savedCustomerAddress.pincode || "",
                          lat: savedCustomerAddress.lat || 22.7196,
                          lng: savedCustomerAddress.lng || 75.8577,
                        }));
                        toast.success(
                          "Delivery address auto-filled from customer profile!",
                        );
                      } else {
                        setShowLocateModal(true);
                      }
                    } else {
                      setEnableDelivery(false);
                    }
                  }}
                  className={`w-12 h-6 flex items-center p-1 rounded-full cursor-pointer transition-all duration-300 border ${
                    enableDelivery
                      ? "bg-slate-900 border-slate-900 justify-end"
                      : "bg-slate-200 border-slate-300 justify-start"
                  }`}>
                  <motion.div
                    layout
                    className="w-4 h-4 bg-white rounded-full shadow-xs"
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  />
                </button>
              </div>

              {enableDelivery && (
                <div className="pt-3 border-t border-slate-200/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="material-symbols-outlined text-emerald-600 text-sm shrink-0">
                      location_on
                    </span>
                    <span className="text-xs font-bold text-slate-800 truncate">
                      {addressDetails.flatNo || addressDetails.street
                        ? `${addressDetails.flatNo ? addressDetails.flatNo + ", " : ""}${addressDetails.street}`
                        : "No address configured yet"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowLocateModal(true)}
                      className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-[11px] font-bold hover:bg-slate-50 transition-colors">
                      Edit Address
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeliveryTypeModal(true)}
                      className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[11px] font-bold hover:bg-slate-800 transition-colors flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs">
                        schedule
                      </span>
                      Schedule
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 3. Services Selection */}
        <section
          className={`bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4 transition-all duration-300 ${!isVerified ? "opacity-40 pointer-events-none" : ""}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-700">
                3
              </span>
              <h2 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Select Garments & Services
              </h2>
            </div>
            <span className="text-[11px] font-bold text-slate-400">
              {filteredServices.length} options
            </span>
          </div>

          {/* Category Filter Pills */}
          {uniqueCategories.length > 0 && (
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1 -mx-1 px-1">
              {uniqueCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleCategoryClick(cat)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap border shrink-0 ${
                    selectedCategory === cat
                      ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                      : "bg-slate-50 text-slate-600 border-slate-200/80 hover:bg-slate-100"
                  }`}>
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* Subcategory Filter Pills */}
          <AnimatePresence>
            {uniqueSubCategories.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-1 -mx-1 px-1">
                {uniqueSubCategories.map((sub) => (
                  <button
                    key={sub}
                    onClick={() => handleSubCategoryClick(sub)}
                    className={`px-3 py-1.5 text-[11px] font-bold rounded-lg uppercase tracking-wider whitespace-nowrap border transition-all shrink-0 ${
                      selectedSubCategory === sub
                        ? "bg-blue-50 text-blue-700 border-blue-200"
                        : "bg-white text-slate-500 border-slate-200/60 hover:bg-slate-50"
                    }`}>
                    {sub}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Service Items Grid / List */}
          <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
            {filteredServices.length > 0 ? (
              filteredServices.map((s) => {
                const qty = getServiceQty(s.serviceId);
                const photos = itemPhotos[s.serviceId] || [];
                return (
                  <div
                    key={s.serviceId}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                      qty > 0
                        ? "bg-slate-50/80 border-slate-900/40 shadow-xs"
                        : "bg-white border-slate-100 hover:border-slate-200"
                    }`}>
                    {/* Icon & Details */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${qty > 0 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>
                        <span className="material-symbols-outlined text-lg">
                          {s.icon || "dry_cleaning"}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-black text-slate-900 uppercase truncate leading-snug">
                          {s.title}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-400 font-medium">
                            {s.subCategory || s.category}
                          </span>
                          <span className="text-xs font-black text-slate-900">
                            ₹{s.price}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quantity & Photos */}
                    <div className="flex items-center gap-2 shrink-0">
                      {qty > 0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setActivePhotoService({
                              id: s.serviceId,
                              name: s.title,
                            })
                          }
                          className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all ${
                            photos.length > 0
                              ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                              : "bg-white text-slate-400 border-slate-200 hover:text-slate-700"
                          }`}
                          title="Attach Garment Photos">
                          <span className="material-symbols-outlined text-sm">
                            photo_camera
                          </span>
                          {photos.length > 0 && (
                            <span className="text-[9px] font-black ml-0.5">
                              {photos.length}
                            </span>
                          )}
                        </button>
                      )}

                      {qty === 0 ? (
                        <button
                          type="button"
                          onClick={() => updateServiceQty(s, 1)}
                          className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider hover:bg-slate-800 transition-colors shadow-xs">
                          Add
                        </button>
                      ) : (
                        <div className="flex items-center bg-white rounded-xl border border-slate-200 p-0.5 shadow-2xs">
                          <button
                            type="button"
                            onClick={() => updateServiceQty(s, -1)}
                            className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-50">
                            <span className="material-symbols-outlined text-sm">
                              remove
                            </span>
                          </button>
                          <span
                            onClick={() => {
                              setManualQtyService(s);
                              setManualQtyInput(qty.toString());
                            }}
                            className="w-7 text-center text-xs font-black text-slate-900 cursor-pointer hover:bg-slate-100 rounded py-0.5">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateServiceQty(s, 1)}
                            className="w-7 h-7 flex items-center justify-center text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-50">
                            <span className="material-symbols-outlined text-sm">
                              add
                            </span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-12 text-center text-xs text-slate-400 font-medium">
                No services found matching the filters
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Sticky Bottom Order Bar */}
      <AnimatePresence>
        {items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-16 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t border-slate-200 z-40 shadow-lg">
            <div className="max-w-2xl mx-auto flex items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  {items.reduce((sum, item) => sum + item.quantity, 0)} Items
                  Selected
                </span>
                <span className="text-xl font-black text-slate-900 tracking-tight">
                  ₹{total.toFixed(0)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewModal(true)}
                disabled={
                  items.length === 0 ||
                  !customerPhone ||
                  !isVerified ||
                  isProcessing
                }
                className="px-7 py-3.5 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg hover:bg-slate-800 disabled:opacity-40 transition-all flex items-center gap-2">
                <span>Review Order</span>
                <span className="material-symbols-outlined text-sm">
                  arrow_forward
                </span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invoice Modal */}
      <AnimatePresence>
        {showInvoice && createdOrder && (
          <div className="fixed inset-0 z-[6000] flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-950/90 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-none shadow-2xl overflow-hidden relative">
              {/* Blue Header Accent */}
              <div className="h-2 bg-[#3D5AFE]"></div>

              <div className="p-8 space-y-8">
                {/* Brand & Title */}
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-2xl font-black tracking-tighter uppercase text-slate-950">
                      Spinzyt
                    </h3>
                    <p className="text-[10px] font-black text-[#3D5AFE] uppercase tracking-widest">
                      Hub Invoice
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Ref ID
                    </p>
                    <p className="text-sm font-black text-slate-900">
                      {createdOrder.orderId}
                    </p>
                  </div>
                </div>

                {/* Customer & Store Info */}
                <div className="grid grid-cols-2 gap-4 pb-6 border-b border-slate-100">
                  <div className="space-y-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Customer
                    </p>
                    <p className="text-sm font-bold text-slate-800 tracking-tight leading-tight">
                      {customerName
                        ? `${customerName}`
                        : `+91 ${customerPhone}`}
                    </p>
                    {customerName && (
                      <p className="text-[10px] font-bold text-slate-400">
                        +91 {customerPhone}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Store Entity
                    </p>
                    <p className="text-sm font-bold text-slate-800 tracking-tight truncate">
                      {vendorData.displayName || "Official Hub"}
                    </p>
                  </div>
                  <div className="space-y-1 col-span-2 border-t border-slate-100 pt-3">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Delivery Mode
                    </p>
                    <p className="text-sm font-bold text-slate-800 tracking-tight text-wrap">
                      {createdOrder.riderDropOff
                        ? `${createdOrder.deliveryMode || (isExpress ? "Express" : "Normal")} Delivery (Address: ${createdOrder.dropAddress})`
                        : "Self Delivery / Customer"}
                    </p>
                  </div>
                </div>

                {/* Billing Table */}
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                    Itemized Billing
                  </p>
                  <div className="space-y-3">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-center bg-slate-50 px-5 py-3 rounded-none">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black text-[#3D5AFE]">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="text-[11px] font-bold text-slate-800">
                              {item.title}
                            </p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                              {item.tag}
                            </p>
                          </div>
                        </div>
                        <span className="text-[11px] font-black text-slate-900">
                          ₹{item.price}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Final Total Card */}
                <div className="bg-slate-900 rounded-none p-6 text-white flex justify-between items-center shadow-lg">
                  <div className="space-y-0.5">
                    <p className="text-[9px] font-black text-[#73e0c9] uppercase tracking-[0.2em] leading-none mb-1">
                      Net Payable
                    </p>
                    <p className="text-xs font-bold text-slate-400 leading-none">
                      Status: Success (Paid)
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-black tracking-tighter">
                      ₹{total.toFixed(2)}
                    </p>
                  </div>
                </div>

                {/* Footer & Action */}
                <div className="space-y-6">
                  <div className="text-center">
                    <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.3em]">
                      Thank you for your visit!
                    </p>
                  </div>
                  <div className="flex gap-3 print:hidden">
                    <button
                      onClick={() => window.print()}
                      className="flex-1 py-4 bg-slate-100 text-slate-950 rounded-none font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-lg">
                        print
                      </span>
                      Print Slip
                    </button>
                    <button
                      onClick={() => {
                        setShowInvoice(false);
                        setItems([]);
                        setCustomerPhone("");
                        setCustomerName("");
                        navigate("/vendor/dashboard");
                      }}
                      className="flex-1 py-4 bg-[#3D5AFE] text-white rounded-none font-black text-[10px] uppercase tracking-widest shadow-lg shadow-[#3D5AFE]/20 flex items-center justify-center gap-2">
                      <span className="material-symbols-outlined text-lg">
                        home
                      </span>
                      Dashboard
                    </button>
                  </div>
                </div>
              </div>

              {/* Hidden Professional Print Area */}
              <div className="hidden print:block fixed inset-0 bg-white p-10 font-mono text-slate-900 leading-tight">
                <div className="max-w-[400px] mx-auto border-2 border-slate-900 p-6 space-y-6">
                  <div className="text-center border-b-2 border-slate-900 pb-4">
                    <h2 className="text-3xl font-black tracking-tighter uppercase mb-1">
                      Spinzyt Laundry
                    </h2>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-60">
                      Professional Care Network
                    </p>
                    <p className="text-xs font-bold mt-2">
                      {vendorData.displayName || "Authorized Hub"}
                    </p>
                  </div>

                  <div className="flex justify-between text-[11px] font-bold border-b border-slate-200 pb-4">
                    <div className="space-y-1">
                      <p>ORDER: {createdOrder.orderId}</p>
                      <p>DATE: {new Date().toLocaleDateString()}</p>
                      <p>
                        TIME:{" "}
                        {new Date().toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      {customerName && (
                        <p>NAME: {customerName.toUpperCase()}</p>
                      )}
                      <p>CUST: +91 {customerPhone}</p>
                      <p>TYPE: WALK-IN</p>
                      <p>STATUS: PAID</p>
                    </div>
                  </div>

                  <div className="text-[10px] font-mono border-b border-slate-200 pb-4 space-y-0.5">
                    <p>
                      DELIVERY MODE:{" "}
                      {createdOrder.riderDropOff
                        ? `${(createdOrder.deliveryMode || (isExpress ? "Express" : "Normal")).toUpperCase()} DELIVERY`
                        : "SELF / CUSTOMER"}
                    </p>
                    {createdOrder.riderDropOff && (
                      <p className="break-all whitespace-normal">
                        DELIVERY ADDR: {createdOrder.dropAddress}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <table className="w-full text-xs font-bold">
                      <thead>
                        <tr className="border-b-2 border-slate-900 text-left">
                          <th className="py-1">DESCRIPTION</th>
                          <th className="py-1 text-right">TAG</th>
                          <th className="py-1 text-right">PRICE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, i) => (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="py-2">{item.title}</td>
                            <td className="py-2 text-right">{item.tag}</td>
                            <td className="py-2 text-right">₹{item.price}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-between items-center bg-slate-100 p-3 rounded-lg">
                    <p className="text-sm font-black uppercase tracking-widest">
                      Grand Total
                    </p>
                    <p className="text-xl font-black underline decoration-2">
                      ₹{total.toFixed(2)}
                    </p>
                  </div>

                  <div className="flex justify-between items-end pt-4 border-t-2 border-slate-900 border-dashed">
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <p className="text-[8px] font-black uppercase tracking-widest leading-none mb-1">
                          Authorized Scan
                        </p>
                        <div className="w-16 h-16 bg-white border-2 border-slate-900 p-1">
                          <div className="w-full h-full bg-slate-950 flex flex-wrap gap-[2px] p-[2px]">
                            {Array.from({ length: 36 }).map((_, i) => (
                              <div
                                key={i}
                                className={`w-[6px] h-[6px] ${Math.random() > 0.5 ? "bg-white" : "bg-transparent"}`}></div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[7px] font-bold uppercase tracking-tighter opacity-70">
                          1. Not responsible for color bleed.
                        </p>
                        <p className="text-[7px] font-bold uppercase tracking-tighter opacity-70">
                          2. Deliver within 48 hours.
                        </p>
                        <p className="text-[7px] font-bold uppercase tracking-tighter opacity-70">
                          3. Non-refundable item check.
                        </p>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="w-24 h-8 border-b border-slate-500 mb-1"></div>
                      <p className="text-[7px] font-bold uppercase opacity-50">
                        Store Manager
                      </p>
                    </div>
                  </div>

                  <div className="text-center pt-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] opacity-40">
                      *** Thank You for choosing Spinzyt ***
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Combined Pickup & Drop-off Logistics Modal */}
      <AnimatePresence>
        {showDeliveryTypeModal && (
          <div className="fixed inset-0 z-[6000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeliveryTypeModal(false)}
              className="absolute inset-0 bg-transparent"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              className="relative w-full max-w-[380px] sm:max-w-[420px] bg-white rounded-[2rem] p-5 sm:p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto border border-slate-100">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base sm:text-lg font-black tracking-tight text-slate-900 uppercase">
                    Select Logistics
                  </h3>
                  <p className="text-[11px] font-medium text-slate-400">
                    Rider delivery logistics
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDeliveryTypeModal(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-colors cursor-pointer">
                  <span className="material-symbols-outlined text-base">
                    close
                  </span>
                </button>
              </div>

              <div className="space-y-4">
                {/* 1. Delivery Type Toggle */}
                <div className="bg-slate-100/80 p-1 rounded-2xl border border-slate-200/60 flex gap-1">
                  {["Normal", "Express"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setIsExpress(type === "Express");
                      }}
                      className={`flex-1 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-150 cursor-pointer ${(type === "Express" && isExpress === true) || (type === "Normal" && isExpress === false) ? "bg-slate-950 text-white shadow-md" : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"}`}>
                      {type === "Normal"
                        ? "Normal Delivery"
                        : "Express Delivery"}
                    </button>
                  ))}
                </div>

                {/* --- PICKUP SECTION --- */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                      <span className="material-symbols-outlined text-xs">
                        calendar_today
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      1. Pickup
                    </p>
                  </div>

                  <div className="space-y-3 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100">
                    {/* Pickup Address */}
                    <div className="relative">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-0.5">
                        Select Address
                      </p>
                      <button
                        className="w-full bg-white px-3.5 py-2.5 rounded-xl border border-slate-200/80 text-xs font-semibold tracking-tight text-left flex justify-between items-center shadow-xs cursor-not-allowed opacity-80"
                        disabled>
                        <span className="text-slate-900 font-bold">
                          WALK-IN STORE
                        </span>
                        <span className="material-symbols-outlined text-slate-400 text-sm">
                          lock
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* --- DROP-OFF SECTION --- */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <div className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                      <span className="material-symbols-outlined text-xs">
                        local_shipping
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      2. Drop-off
                    </p>
                  </div>

                  <div className="space-y-3 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100">
                    {/* Drop-off Address Dropdown */}
                    <div className="relative">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-0.5">
                        Drop-off Address
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          setOpenDropdown(
                            openDropdown === "dropAddress"
                              ? null
                              : "dropAddress",
                          )
                        }
                        className="w-full bg-white px-3.5 py-2.5 rounded-xl border border-slate-200/80 text-xs font-semibold text-left flex justify-between items-center shadow-xs hover:border-slate-300 transition-all cursor-pointer">
                        <span
                          className={
                            addressDetails.type
                              ? "text-slate-900 font-bold"
                              : "text-slate-400 font-normal"
                          }>
                          {addressDetails.type
                            ? addressDetails.type.toUpperCase()
                            : "Choose Address"}
                        </span>
                        <span
                          className={`material-symbols-outlined text-slate-400 text-sm transition-transform ${openDropdown === "dropAddress" ? "rotate-180" : ""}`}>
                          expand_more
                        </span>
                      </button>

                      <AnimatePresence>
                        {openDropdown === "dropAddress" && (
                          <motion.div
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="absolute z-[6100] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                            <div className="max-h-40 overflow-y-auto font-sans">
                              {addressDetails.street && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenDropdown(null);
                                  }}
                                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold uppercase hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors cursor-pointer">
                                  {addressDetails.type
                                    ? addressDetails.type.toUpperCase()
                                    : "CURRENT ADDRESS"}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setShowDeliveryTypeModal(false);
                                  setShowLocateModal(true);
                                  setOpenDropdown(null);
                                }}
                                className="w-full px-3.5 py-2.5 text-left text-xs font-bold uppercase text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer">
                                + Enter New Address
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Date Dropdown */}
                    <div className="relative">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-0.5">
                        Date
                      </p>
                      <button
                        type="button"
                        disabled={!selectedPickupDate || !selectedPickupTime}
                        onClick={() =>
                          setOpenDropdown(
                            openDropdown === "dropDate" ? null : "dropDate",
                          )
                        }
                        className={`w-full bg-white px-3.5 py-2.5 rounded-xl border border-slate-200/80 text-xs font-semibold text-left flex justify-between items-center shadow-xs transition-all cursor-pointer ${!selectedPickupDate || !selectedPickupTime ? "opacity-50 cursor-not-allowed bg-slate-100" : "hover:border-slate-300"}`}>
                        <span
                          className={
                            selectedDeliveryDate
                              ? "text-slate-900 font-bold"
                              : "text-slate-400 font-normal"
                          }>
                          {!selectedPickupDate || !selectedPickupTime
                            ? "Select Pickup First"
                            : selectedDeliveryDate || "Select Date"}
                        </span>
                        <span
                          className={`material-symbols-outlined text-slate-400 text-sm transition-transform ${openDropdown === "dropDate" ? "rotate-180" : ""}`}>
                          expand_more
                        </span>
                      </button>

                      <AnimatePresence>
                        {openDropdown === "dropDate" && (
                          <motion.div
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="absolute z-[6100] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                            <div className="max-h-40 overflow-y-auto font-sans">
                              {availableDates
                                .filter((d) => {
                                  if (
                                    !selectedPickupDate ||
                                    !selectedPickupTime
                                  )
                                    return true;
                                  const dateStr = `${d.day}, ${d.date}`;
                                  const pDT = getSlotDateTime(
                                    selectedPickupDate,
                                    selectedPickupTime,
                                  );
                                  const lastSlotDT = getSlotDateTime(
                                    dateStr,
                                    WALK_IN_TIME_SLOTS[
                                      WALK_IN_TIME_SLOTS.length - 1
                                    ],
                                  );
                                  const minH = isExpress
                                    ? 24
                                    : maxServiceTime * 24;
                                  return (
                                    (lastSlotDT - pDT) / (1000 * 60 * 60) >=
                                    minH
                                  );
                                })
                                .map((d, i) => {
                                  const dateStr = `${d.day}, ${d.date}`;
                                  return (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => {
                                        setSelectedDeliveryDate(dateStr);
                                        setOpenDropdown(null);
                                      }}
                                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold uppercase border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer">
                                      {d.day}, {d.date}
                                    </button>
                                  );
                                })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Time Dropdown */}
                    <div className="relative">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 ml-0.5">
                        Time
                      </p>
                      <button
                        type="button"
                        disabled={
                          !selectedPickupDate ||
                          !selectedPickupTime ||
                          !selectedDeliveryDate
                        }
                        onClick={() =>
                          setOpenDropdown(
                            openDropdown === "dropTime" ? null : "dropTime",
                          )
                        }
                        className={`w-full bg-white px-3.5 py-2.5 rounded-xl border border-slate-200/80 text-xs font-semibold text-left flex justify-between items-center shadow-xs transition-all cursor-pointer ${!selectedPickupDate || !selectedPickupTime || !selectedDeliveryDate ? "opacity-50 cursor-not-allowed bg-slate-100" : "hover:border-slate-300"}`}>
                        <span
                          className={
                            selectedDeliveryTimeSlot
                              ? "text-slate-900 font-bold"
                              : "text-slate-400 font-normal"
                          }>
                          {!selectedPickupDate ||
                          !selectedPickupTime ||
                          !selectedDeliveryDate
                            ? "Select Pickup/Date First"
                            : selectedDeliveryTimeSlot || "Select Time"}
                        </span>
                        <span
                          className={`material-symbols-outlined text-slate-400 text-sm transition-transform ${openDropdown === "dropTime" ? "rotate-180" : ""}`}>
                          expand_more
                        </span>
                      </button>

                      <AnimatePresence>
                        {openDropdown === "dropTime" && (
                          <motion.div
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="absolute z-[6100] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                            <div className="max-h-40 overflow-y-auto font-sans">
                              {WALK_IN_TIME_SLOTS.filter((slot) => {
                                if (
                                  !selectedPickupDate ||
                                  !selectedPickupTime ||
                                  !selectedDeliveryDate
                                )
                                  return true;
                                const pDT = getSlotDateTime(
                                  selectedPickupDate,
                                  selectedPickupTime,
                                );
                                const dDT = getSlotDateTime(
                                  selectedDeliveryDate,
                                  slot,
                                );
                                const minH = isExpress
                                  ? 24
                                  : maxServiceTime * 24;
                                return (dDT - pDT) / (1000 * 60 * 60) >= minH;
                              }).map((slot) => (
                                <button
                                  key={slot}
                                  type="button"
                                  onClick={() => {
                                    setSelectedDeliveryTimeSlot(slot);
                                    setOpenDropdown(null);
                                  }}
                                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold uppercase border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer">
                                  {slot}
                                </button>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!selectedDeliveryDate || !selectedDeliveryTimeSlot) {
                    toast.error("Please select a drop-off date and time slot.");
                    return;
                  }
                  setEnableDelivery(true);
                  toast.success("Logistics confirmed: Rider drop-off delivery");
                  setShowDeliveryTypeModal(false);
                }}
                className="w-full bg-slate-950 hover:bg-slate-900 text-white py-3.5 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl shadow-slate-950/20 active:scale-[0.98] transition-all cursor-pointer mt-1">
                Confirm Logistics
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PHOTO OPTIONS & MANAGEMENT MODAL (OPTIONAL PHOTO ATTACHMENT) */}
      <AnimatePresence>
        {activePhotoService && (
          <div className="fixed inset-0 z-[8000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-transparent"
              onClick={() => setActivePhotoService(null)}
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-[340px] bg-white rounded-none p-6 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-y-auto hide-scrollbar border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-900 leading-none">
                  Photos for {activePhotoService.name} (Optional)
                </span>
                <button
                  type="button"
                  onClick={() => setActivePhotoService(null)}
                  className="w-7 h-7 rounded-none bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition-colors">
                  <span className="material-symbols-outlined text-base">
                    close
                  </span>
                </button>
              </div>

              {uploading && (
                <div className="flex flex-col items-center justify-center py-4 gap-2 text-slate-500">
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{
                      repeat: Infinity,
                      duration: 1,
                      ease: "linear",
                    }}
                    className="material-symbols-outlined text-2xl">
                    autorenew
                  </motion.span>
                  <span className="text-[9px] font-black uppercase tracking-widest">
                    Uploading media...
                  </span>
                </div>
              )}

              {/* Existing Photos Grid */}
              {itemPhotos[activePhotoService.id]?.length > 0 ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    {itemPhotos[activePhotoService.id].map((photo, idx) => (
                      <div
                        key={idx}
                        className="relative aspect-square rounded-none overflow-hidden border border-slate-100 bg-slate-50 group">
                        <img
                          src={photo}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleDeletePhoto(activePhotoService.id, photo)
                          }
                          className="absolute top-1 right-1 w-5 h-5 bg-rose-500 text-white rounded-none flex items-center justify-center shadow-md hover:bg-rose-600 transition-all"
                          title="Remove Photo">
                          <span className="material-symbols-outlined text-[10px] font-bold">
                            close
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => galleryInputRef.current.click()}
                      className="flex-1 bg-slate-900 text-white py-2.5 rounded-none font-black text-[8px] uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-slate-800 transition-colors">
                      <span className="material-symbols-outlined text-xs">
                        add
                      </span>{" "}
                      Add More
                    </button>
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current.click()}
                      className="flex-1 bg-white border border-slate-200 text-slate-900 py-2.5 rounded-none font-black text-[8px] uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-slate-50 transition-colors">
                      <span className="material-symbols-outlined text-xs">
                        photo_camera
                      </span>{" "}
                      Take Photo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          window.confirm("Delete all photos for this service?")
                        ) {
                          setItemPhotos((prev) => {
                            const { [activePhotoService.id]: _, ...rest } =
                              prev;
                            return rest;
                          });
                          toast.success("All photos removed");
                        }
                      }}
                      className="flex-1 bg-rose-50 text-rose-600 py-2.5 rounded-none font-black text-[8px] uppercase tracking-widest flex items-center justify-center gap-1.5 hover:bg-rose-100 transition-colors">
                      <span className="material-symbols-outlined text-xs">
                        delete
                      </span>{" "}
                      Clear All
                    </button>
                  </div>
                </div>
              ) : (
                /* No Photos State */
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => galleryInputRef.current.click()}
                    className="w-full bg-slate-50 rounded-none p-6 flex flex-col items-center justify-center gap-2 border border-dashed border-slate-200 hover:border-slate-900 transition-all text-slate-500 hover:text-slate-800">
                    <div className="w-10 h-10 rounded-none bg-white flex items-center justify-center text-slate-800 shadow-sm border border-slate-100">
                      <span className="material-symbols-outlined text-xl">
                        photo_library
                      </span>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest">
                      Choose from Gallery
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => cameraInputRef.current.click()}
                    className="w-full bg-slate-50 rounded-none p-6 flex flex-col items-center justify-center gap-2 border border-dashed border-slate-200 hover:border-slate-900 transition-all text-slate-500 hover:text-slate-800">
                    <div className="w-10 h-10 rounded-none bg-white flex items-center justify-center text-slate-800 shadow-sm border border-slate-100">
                      <span className="material-symbols-outlined text-xl">
                        photo_camera
                      </span>
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-widest">
                      Capture Photo
                    </span>
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLocateModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#f8f9fa] rounded-[2rem] p-6 w-full max-w-[360px] shadow-2xl relative overflow-hidden flex flex-col h-[520px]">
              <div className="flex-1 overflow-y-auto hide-scrollbar -mx-2 px-2 pb-6 pt-2">
                <div className="mb-6">
                  <button
                    type="button"
                    onClick={() => setShowLocateModal(false)}
                    className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-colors mb-2 -ml-2 bg-slate-100 rounded-full">
                    <span className="material-symbols-outlined text-[18px]">
                      arrow_back
                    </span>
                  </button>
                  <h2 className="text-[40px] font-black uppercase tracking-tighter leading-[0.9] text-[#1a1f2b]">
                    ADDRESS.
                  </h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-3">
                    Details for accurate delivery
                  </p>
                </div>

                <div className="space-y-5 mt-8">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">
                      Search your location
                    </label>
                    {isLoaded ? (
                      <Autocomplete
                        onLoad={(ac) => setAutocompleteInstance(ac)}
                        onPlaceChanged={async () => {
                          if (!autocompleteInstance) return;
                          const place = autocompleteInstance.getPlace();
                          if (!place || !place.geometry) return;

                          const lat = place.geometry.location.lat();
                          const lng = place.geometry.location.lng();

                          let street = "";
                          let city = "";
                          let state = "";
                          let pincode = "";

                          if (place.address_components) {
                            const streetNumberComp =
                              place.address_components.find((c) =>
                                c.types.includes("street_number"),
                              );
                            const routeComp = place.address_components.find(
                              (c) => c.types.includes("route"),
                            );
                            const sublocalityComp =
                              place.address_components.find((c) =>
                                c.types.includes("sublocality_level_1"),
                              );
                            const neighborhoodComp =
                              place.address_components.find((c) =>
                                c.types.includes("neighborhood"),
                              );

                            const parts = [
                              streetNumberComp?.long_name,
                              routeComp?.long_name,
                              sublocalityComp?.long_name,
                              neighborhoodComp?.long_name,
                            ].filter(Boolean);

                            street = parts.join(", ") || place.name || "";

                            const cityComp = place.address_components.find(
                              (c) =>
                                c.types.includes("locality") ||
                                c.types.includes("administrative_area_level_2"),
                            );
                            city = cityComp ? cityComp.long_name : "";

                            const stateComp = place.address_components.find(
                              (c) =>
                                c.types.includes("administrative_area_level_1"),
                            );
                            state = stateComp ? stateComp.long_name : "";

                            const pinComp = place.address_components.find((c) =>
                              c.types.includes("postal_code"),
                            );
                            pincode = pinComp ? pinComp.long_name : "";
                          }

                          setAddressDetails((prev) => ({
                            ...prev,
                            street: street,
                            city: city,
                            state: state,
                            pincode: pincode,
                            lat,
                            lng,
                          }));
                        }}>
                        <input
                          type="text"
                          placeholder="Search for your house/building..."
                          className="w-full bg-[#111625] text-white px-5 py-4 rounded-[1.2rem] text-sm font-bold outline-none placeholder:text-slate-500 shadow-inner"
                        />
                      </Autocomplete>
                    ) : (
                      <div className="w-full h-[52px] bg-slate-200 animate-pulse rounded-[1.2rem]" />
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      className={`flex-1 py-4 rounded-[1.2rem] flex flex-col items-center justify-center gap-1.5 transition-all ${addressDetails.type === "HOME" ? "bg-black text-white shadow-xl shadow-black/20" : "bg-transparent border border-slate-200 text-[#a0aabf]"}`}
                      onClick={() =>
                        setAddressDetails({ ...addressDetails, type: "HOME" })
                      }>
                      <span className="material-symbols-outlined text-[18px]">
                        lock
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-widest">
                        Home
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`flex-1 py-4 rounded-[1.2rem] flex flex-col items-center justify-center gap-1.5 transition-all ${addressDetails.type === "OFFICE" ? "bg-black text-white shadow-xl shadow-black/20" : "bg-transparent border border-slate-200 text-[#a0aabf]"}`}
                      onClick={() =>
                        setAddressDetails({ ...addressDetails, type: "OFFICE" })
                      }>
                      <span className="material-symbols-outlined text-[18px]">
                        work
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-widest">
                        Office
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`flex-1 py-4 rounded-[1.2rem] flex flex-col items-center justify-center gap-1.5 transition-all ${addressDetails.type === "OTHER" ? "bg-black text-white shadow-xl shadow-black/20" : "bg-transparent border border-slate-200 text-[#a0aabf]"}`}
                      onClick={() =>
                        setAddressDetails({ ...addressDetails, type: "OTHER" })
                      }>
                      <span className="material-symbols-outlined text-[18px]">
                        location_on
                      </span>
                      <span className="text-[9px] font-black uppercase tracking-widest">
                        Other
                      </span>
                    </button>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">
                      Address Line 1
                    </label>
                    <input
                      type="text"
                      placeholder="Flat/House No, Building Name"
                      value={addressDetails.flatNo || ""}
                      onChange={(e) =>
                        setAddressDetails({
                          ...addressDetails,
                          flatNo: e.target.value,
                        })
                      }
                      className="w-full bg-[#f1f3f6] border border-slate-200/50 px-5 py-3.5 rounded-[1.2rem] text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-slate-300 transition-all outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">
                      Address Line 2
                    </label>
                    <input
                      type="text"
                      placeholder="Street, Area Name"
                      value={addressDetails.street || ""}
                      onChange={(e) =>
                        setAddressDetails({
                          ...addressDetails,
                          street: e.target.value,
                        })
                      }
                      className="w-full bg-[#f1f3f6] border border-slate-200/50 px-5 py-3.5 rounded-[1.2rem] text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-slate-300 transition-all outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">
                        Floor / Apt
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 4th Floor"
                        value={addressDetails.floor || ""}
                        onChange={(e) =>
                          setAddressDetails({
                            ...addressDetails,
                            floor: e.target.value,
                          })
                        }
                        className="w-full bg-[#f1f3f6] border border-slate-200/50 px-5 py-3.5 rounded-[1.2rem] text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-slate-300 transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">
                        Landmark
                      </label>
                      <input
                        type="text"
                        placeholder="Near Temple/Gym"
                        value={addressDetails.landmark || ""}
                        onChange={(e) =>
                          setAddressDetails({
                            ...addressDetails,
                            landmark: e.target.value,
                          })
                        }
                        className="w-full bg-[#f1f3f6] border border-slate-200/50 px-5 py-3.5 rounded-[1.2rem] text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-slate-300 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">
                        Pincode
                      </label>
                      <input
                        type="text"
                        placeholder="6-digit ZIP"
                        value={addressDetails.pincode || ""}
                        onChange={(e) =>
                          setAddressDetails({
                            ...addressDetails,
                            pincode: e.target.value,
                          })
                        }
                        className="w-full bg-[#f1f3f6] border border-slate-200/50 px-5 py-3.5 rounded-[1.2rem] text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-slate-300 transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">
                        City
                      </label>
                      <input
                        type="text"
                        placeholder="City Name"
                        value={addressDetails.city || ""}
                        onChange={(e) =>
                          setAddressDetails({
                            ...addressDetails,
                            city: e.target.value,
                          })
                        }
                        className="w-full bg-[#f1f3f6] border border-slate-200/50 px-5 py-3.5 rounded-[1.2rem] text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-slate-300 transition-all outline-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-900 uppercase tracking-widest ml-1">
                      State
                    </label>
                    <input
                      type="text"
                      placeholder="State Name"
                      value={addressDetails.state || ""}
                      onChange={(e) =>
                        setAddressDetails({
                          ...addressDetails,
                          state: e.target.value,
                        })
                      }
                      className="w-full bg-[#f1f3f6] border border-slate-200/50 px-5 py-3.5 rounded-[1.2rem] text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-slate-300 transition-all outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-2 bg-[#f8f9fa] relative z-10">
                <button
                  type="button"
                  disabled={isCalculatingFee}
                  onClick={() => {
                    if (!addressDetails.type) {
                      toast.error(
                        "Please select an address type (Home, Office, Other)",
                      );
                      return;
                    }
                    if (!addressDetails.flatNo?.trim()) {
                      toast.error("Please enter Address Line 1");
                      return;
                    }

                    // Save address instantly to DB if customerId exists
                    if (customerId) {
                      const rawType = addressDetails.type || "HOME";
                      const formattedType =
                        rawType.charAt(0).toUpperCase() +
                        rawType.slice(1).toLowerCase();
                      const formattedAddress = `${addressDetails.flatNo ? addressDetails.flatNo + ", " : ""}${addressDetails.street}`;

                      const newAddressObj = {
                        type: formattedType,
                        address: formattedAddress,
                        city: addressDetails.city || "",
                        state: addressDetails.state || "",
                        pincode: addressDetails.pincode || "",
                        location: {
                          lat: Number(addressDetails.lat) || 0,
                          lng: Number(addressDetails.lng) || 0,
                        },
                        isDefault: true,
                      };

                      const updatedSavedAddress = {
                        type: formattedType,
                        flatNo: addressDetails.flatNo,
                        street: addressDetails.street,
                        city: addressDetails.city || "",
                        state: addressDetails.state || "",
                        pincode: addressDetails.pincode || "",
                        lat: Number(addressDetails.lat) || 0,
                        lng: Number(addressDetails.lng) || 0,
                      };
                      setSavedCustomerAddress(updatedSavedAddress);

                      authApi
                        .updateProfile(customerId, {
                          address: formattedAddress,
                          location: {
                            lat: Number(addressDetails.lat) || 0,
                            lng: Number(addressDetails.lng) || 0,
                          },
                          addresses: [newAddressObj],
                        }, customerAddressAuthorization)
                        .then(() => {
                          console.log(
                            "Customer address instantly persisted to DB successfully.",
                          );
                        })
                        .catch((err) => {
                          console.error(
                            "Failed to persist customer address to DB:",
                            err,
                          );
                          toast.error(
                            err.message || "Could not save address to customer profile on server",
                          );
                        });
                    }

                    // Mock Logistic Fee API Simulation
                    setIsCalculatingFee(true);
                    const mockLoadingToast = toast.loading(
                      "Calculating Logistic Fee...",
                    );

                    setTimeout(() => {
                      // Dummy logic: Base 40 + Random up to 50
                      const dummyFee = Math.floor(40 + Math.random() * 50);
                      setCalculatedLogisticFee(dummyFee);
                      setIsCalculatingFee(false);
                      toast.dismiss(mockLoadingToast);
                      toast.success(`Fee Calculated: ₹${dummyFee}`);
                      setShowLocateModal(false);
                    }, 1500);
                  }}
                  className={`w-full py-4 rounded-full text-xs font-black uppercase tracking-widest active:scale-95 transition-all shadow-xl shadow-black/20 ${addressDetails.type && addressDetails.flatNo?.trim() && !isCalculatingFee ? "bg-black text-white" : "bg-slate-300 text-slate-500 cursor-not-allowed"}`}>
                  {isCalculatingFee ? "CALCULATING..." : "Save Address"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {manualQtyService && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setManualQtyService(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative bg-white rounded-3xl p-6 shadow-2xl w-full max-w-xs z-10 flex flex-col gap-4 items-center">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-900">
                <span className="material-symbols-outlined">edit_square</span>
              </div>
              <div className="text-center">
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-900">
                  {manualQtyService.title}
                </h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                  Enter Quantity (1-99)
                </p>
              </div>
              <input
                type="number"
                min="1"
                max="99"
                value={manualQtyInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "");
                  if (
                    val === "" ||
                    (parseInt(val) >= 1 && parseInt(val) <= 99)
                  ) {
                    setManualQtyInput(val);
                  }
                }}
                className="w-full text-center text-2xl font-black text-slate-900 bg-slate-50 border-2 border-slate-200 rounded-2xl p-3 focus:outline-none focus:border-slate-900 focus:bg-white transition-all"
                autoFocus
              />
              <div className="flex w-full gap-3 mt-2">
                <button
                  onClick={() => setManualQtyService(null)}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const newQ = parseInt(manualQtyInput);
                    if (newQ >= 1 && newQ <= 99) {
                      setServiceQty(manualQtyService, newQ);
                    }
                    setManualQtyService(null);
                  }}
                  className="flex-1 py-3 rounded-xl bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest hover:bg-slate-800">
                  Save
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* HIDDEN INPUTS FOR PHOTOS */}
      <input
        ref={galleryInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handlePhotoFileChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoFileChange}
        className="hidden"
      />
    </div>
  );
};

export default WalkInOrderPage;
