import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
// eslint-disable-next-line no-unused-vars
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  Clock,
  Search,
  Plus,
  Minus,
  Camera,
  ShoppingBag,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  X,
  Trash2,
  Truck,
  ChevronDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import {
  serviceApi,
  masterServiceApi,
  authApi,
  categoryApi,
  geofenceApi,
  adApi,
  UPLOADS_URL,
  BASE_URL,
} from "../../../lib/api";
import { shippingConfigApi } from "../../../lib/shippingApi";
import { useLocationStore } from "../../../shared/stores/locationStore";
import { locationService } from "../../../lib/locationService";
import { requestForToken } from "../../../lib/firebase";

const HomePage = () => {
  console.log("HomePage Rendering");
  const navigate = useNavigate();
  const {
    location,
    setLocation,
    setPromptOpen,
    pricingFactor,
    setZoneData,
    allowDiscount,
    expressMultiplier,
    heritageMultiplier,
  } = useLocationStore();

  const updateGeofenceForAddress = async (addressStr) => {
    if (!addressStr) return;
    try {
      console.log(`[Geofence] Geocoding pickup address: ${addressStr}`);
      const coords = await locationService.geocodeAddress(addressStr);
      if (coords && coords.lat !== undefined && coords.lng !== undefined) {
        console.log(
          `[Geofence] Geocoded address to coordinates: ${coords.lat}, ${coords.lng}`,
        );
        const zoneInfo = await geofenceApi.checkAvailability(
          coords.lat,
          coords.lng,
        );
        if (zoneInfo.available) {
          setZoneData({
            name: zoneInfo.name,
            pricingFactor: zoneInfo.pricingFactor,
            allowDiscount: zoneInfo.allowDiscount,
            platformMultiplier: zoneInfo.platformMultiplier,
            minPlatformFee: zoneInfo.minPlatformFee,
            maxPlatformFee: zoneInfo.maxPlatformFee,
            expressMultiplier: zoneInfo.expressMultiplier,
            heritageMultiplier: zoneInfo.heritageMultiplier,
          });
          console.log(
            `[Geofence] Zone matches: ${zoneInfo.name} (Multiplier: ${zoneInfo.pricingFactor}x, Discount Allowed: ${zoneInfo.allowDiscount}, Express Multiplier: ${zoneInfo.expressMultiplier}x, Heritage Multiplier: ${zoneInfo.heritageMultiplier}x)`,
          );
        } else {
          setZoneData({
            name: null,
            pricingFactor: 1,
            allowDiscount: false,
            platformMultiplier: 0,
            minPlatformFee: 0,
            maxPlatformFee: null,
            expressMultiplier: 1,
            heritageMultiplier: 1,
          });
          console.log(
            "[Geofence] Address not in any service zone, using default pricing.",
          );
        }
      }
    } catch (err) {
      console.error("[Geofence] Error in updateGeofenceForAddress:", err);
    }
  };

  // FCM TOKEN REGISTRATION
  useEffect(() => {
    const registerToken = async () => {
      try {
        const userData = JSON.parse(localStorage.getItem("user") || "{}");
        const userId = userData._id || userData.id;

        if (userId) {
          const fcmToken = await requestForToken();
          if (fcmToken) {
            await authApi.updateFcmToken(userId, fcmToken);
          }
        }
      } catch (err) {
        console.error("FCM Registration Error:", err);
      }
    };

    registerToken();
  }, []);

  // Removed misplaced useEffect hook to avoid accessing pickupAddress before initialization.

  const [dbBanner, setDbBanner] = useState(null);

  useEffect(() => {
    const fetchDbBanner = async () => {
      try {
        const res = await adApi.getActive("home_banner");
        if (res && res.url) {
          setDbBanner(res);
        }
      } catch (err) {
        console.error("Failed to fetch home banner:", err);
      }
    };
    fetchDbBanner();
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTier, setSelectedTier] = useState(() => {
    const saved = localStorage.getItem("selected_tier");
    if (saved === "Essential" || saved === "Heritage") return saved;
    return null;
  });
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState([]);
  const [subCategories, setSubCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // LOGISTICS STATE
  const [isExpress, setIsExpress] = useState(() => {
    const saved = localStorage.getItem("is_express");
    return saved === null ? null : saved === "true";
  });

  const availableDates = useMemo(() => {
    const dates = [];
    const now = new Date();
    for (let i = 0; i < 8; i++) {
      // Available dates for 8 days
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
  }, []);

  const timeSlots = useMemo(
    () => [
      "07:00 AM - 09:00 AM",
      "09:00 AM - 11:00 AM",
      "11:00 AM - 01:00 PM",
      "01:00 PM - 03:00 PM",
      "03:00 PM - 05:00 PM",
      "05:00 PM - 07:00 PM",
      "07:00 PM - 09:00 PM",
      "08:00 PM - 10:00 PM",
    ],
    [],
  );

  const getSlotDateTime = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return null;

    try {
      let d = null;
      const parts = String(dateStr).split(", ");
      const datePart = parts.length > 1 ? parts[1] : parts[0];

      // Find the corresponding date from availableDates to be precise
      const foundDate = availableDates.find(
        (ad) => ad.date === datePart || ad.raw === dateStr,
      );
      if (foundDate) {
        d = new Date(foundDate.raw);
      } else {
        d = new Date(`${datePart} ${new Date().getFullYear()}`);
      }

      if (isNaN(d.getTime())) {
        d = new Date(dateStr);
      }
      if (isNaN(d.getTime())) return null;

      // Parse Time (e.g., "07:00 AM - 09:00 AM")
      const [timeRange] = String(timeStr).split(" - ");
      const timeParts = (timeRange || "").trim().split(" ");
      const time = timeParts[0] || "";
      const modifier = timeParts[1] || "";

      if (time.includes(":")) {
        const [hours, minutes] = time.split(":");
        let h = parseInt(hours, 10) || 0;
        if (h === 12) h = 0;
        if (modifier === "PM") h += 12;
        const m = parseInt(minutes, 10) || 0;
        d.setHours(h, m, 0, 0);
      }
      return isNaN(d.getTime()) ? null : d;
    } catch (_err) {
      return null;
    }
  };

  const [selectedPickup, setSelectedPickup] = useState(
    () => localStorage.getItem("pickup_date") || "",
  );
  const [pickupTime, setPickupTime] = useState(
    () => localStorage.getItem("pickup_time") || "",
  );

  const [selectedDelivery, setSelectedDelivery] = useState(
    () => localStorage.getItem("delivery_date") || "",
  );
  const [deliveryTime, setDeliveryTime] = useState(
    () => localStorage.getItem("delivery_time") || "",
  );

  const [showSlotPicker, setShowSlotPicker] = useState(false);

  const [savedAddresses, setSavedAddresses] = useState([]);
  const [showAddressPicker, setShowAddressPicker] = useState(false);
  const [activeAddressType, setActiveAddressType] = useState("pickup");
  const [pickupAddress, setPickupAddress] = useState(() => {
    try {
      const saved = localStorage.getItem("pickup_address");
      return saved && saved !== "undefined" && saved !== "null"
        ? JSON.parse(saved)
        : null;
    } catch (_err) {
      return null;
    }
  });
  const [dropAddress, setDropAddress] = useState(() => {
    try {
      const saved = localStorage.getItem("drop_address");
      return saved && saved !== "undefined" && saved !== "null"
        ? JSON.parse(saved)
        : null;
    } catch (_err) {
      return null;
    }
  });
  const [isSameAsPickup, setIsSameAsPickup] = useState(true);

  const [orderNotes, setOrderNotes] = useState(
    () => localStorage.getItem("order_notes") || "",
  );
  const [itemPhotos, setItemPhotos] = useState(() => {
    try {
      const saved = localStorage.getItem("item_photos");
      return saved && saved !== "undefined" && saved !== "null"
        ? JSON.parse(saved)
        : {};
    } catch (_err) {
      return {};
    }
  });

  const [openDropdown, setOpenDropdown] = useState(null); // 'address', 'date', 'time', etc.
  const [activePhotoService, setActivePhotoService] = useState(null);
  const galleryInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    let timeoutId;
    if (!location && !pickupAddress) {
      timeoutId = setTimeout(() => setPromptOpen(true), 1500);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [location, pickupAddress, setPromptOpen]);

  const [isLocating, setIsLocating] = useState(false);
  const [addressDetails, setAddressDetails] = useState({
    line1: "",
    line2: "",
    floor: "",
    landmark: "",
    pincode: "",
    city: "",
    state: "",
  });
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressFormData, setAddressFormData] = useState({
    type: "Other",
  });

  useEffect(() => {
    if (pickupAddress && pickupAddress.address) {
      updateGeofenceForAddress(pickupAddress.address);
      return;
    }

    if (location) {
      const recheckZone = async () => {
        try {
          const zoneInfo = await geofenceApi.checkAvailability(
            location.lat,
            location.lng,
          );
          if (zoneInfo.available) {
            setZoneData({
              name: zoneInfo.name,
              pricingFactor: zoneInfo.pricingFactor,
              allowDiscount: zoneInfo.allowDiscount,
              platformMultiplier: zoneInfo.platformMultiplier,
              minPlatformFee: zoneInfo.minPlatformFee,
              maxPlatformFee: zoneInfo.maxPlatformFee,
              expressMultiplier: zoneInfo.expressMultiplier,
              heritageMultiplier: zoneInfo.heritageMultiplier,
            });
          } else {
            setZoneData({
              name: null,
              pricingFactor: 1,
              allowDiscount: false,
              platformMultiplier: 0,
              minPlatformFee: 0,
              maxPlatformFee: null,
              expressMultiplier: 1,
              heritageMultiplier: 1,
            });
          }
        } catch (err) {
          console.error("Silent zone check failed:", err);
        }
      };
      recheckZone();
    } else {
      setZoneData({
        name: null,
        pricingFactor: 1,
        allowDiscount: false,
        platformMultiplier: 0,
        minPlatformFee: 0,
        maxPlatformFee: null,
        expressMultiplier: 1,
        heritageMultiplier: 1,
      });
    }
  }, [location, pickupAddress, setZoneData]);

  const handleSaveCustomAddress = async () => {
    const { line1, line2, floor, landmark, pincode, city, state } =
      addressDetails;
    if (!line1 || !city || !state)
      return await appDialog.alert(
        "Please fill in required address fields (Line 1, City, State)",
      );

    const formattedAddress = `${line1}${line2 ? ", " + line2 : ""}${floor ? ", " + floor : ""}${landmark ? " (Near " + landmark + ")" : ""}, ${city}, ${state} - ${pincode}`;

    const newAddr = {
      id: Date.now().toString(),
      type: addressFormData.type,
      address: formattedAddress,
      fullAddress: formattedAddress,
      details: addressDetails, // Keep details for editing if needed later
    };

    // Update Local State
    setSavedAddresses((prev) => [...prev, newAddr]);

    if (activeAddressType === "pickup") {
      setPickupAddress(newAddr);
      if (isSameAsPickup) setDropAddress(newAddr);
      updateGeofenceForAddress(newAddr.address);
    } else {
      setDropAddress(newAddr);
    }

    // Sync to Backend Profile if logged in
    try {
      const userData = JSON.parse(localStorage.getItem("user") || "{}");
      const userId = userData._id || userData.id;
      if (userId) {
        const currentProfile = await authApi.getProfile(userId);
        const existingAddresses = currentProfile.addresses || [];

        // DEDUPLICATE: If Home/Office, replace existing; if Other, append.
        let newAddressesList = [];
        if (newAddr.type === "Home" || newAddr.type === "Office") {
          newAddressesList = [
            ...existingAddresses.filter((a) => a.type !== newAddr.type),
            { type: newAddr.type, address: newAddr.address },
          ];
        } else {
          newAddressesList = [
            ...existingAddresses,
            { type: newAddr.type, address: newAddr.address },
          ];
        }

        await authApi.updateProfile(userId, {
          addresses: newAddressesList,
        });
        toast.success("Address saved to profile");
      }
    } catch (err) {
      console.error("Error saving address to profile:", err);
    }

    setShowAddressForm(false);
    setShowAddressPicker(false);
    setShowSlotPicker(true); // Re-open the slot picker after saving
  };

  useEffect(() => {
    if (selectedTier) {
      localStorage.setItem("selected_tier", selectedTier);
    } else {
      localStorage.removeItem("selected_tier");
    }
  }, [selectedTier]);

  useEffect(() => {
    localStorage.setItem("is_express", isExpress);
    localStorage.setItem("pickup_date", selectedPickup);
    localStorage.setItem("pickup_time", pickupTime);
    localStorage.setItem("delivery_date", selectedDelivery);
    localStorage.setItem("delivery_time", deliveryTime);
    if (pickupAddress)
      localStorage.setItem("pickup_address", JSON.stringify(pickupAddress));
    if (dropAddress)
      localStorage.setItem("drop_address", JSON.stringify(dropAddress));
    localStorage.setItem("order_notes", orderNotes);
    localStorage.setItem("item_photos", JSON.stringify(itemPhotos));
  }, [
    selectedTier,
    isExpress,
    selectedPickup,
    pickupTime,
    selectedDelivery,
    deliveryTime,
    pickupAddress,
    dropAddress,
    orderNotes,
    itemPhotos,
  ]);

  const [selectedQuantities, setSelectedQuantities] = useState(() => {
    const saved = localStorage.getItem("cart_quantities");
    return saved ? JSON.parse(saved) : {};
  });

  useEffect(() => {
    localStorage.setItem("cart_quantities", JSON.stringify(selectedQuantities));
  }, [selectedQuantities]);

  // Listen for cart reset across the app
  useEffect(() => {
    const handleCartReset = () => {
      const saved = localStorage.getItem("cart_quantities");
      if (!saved || saved === "{}" || saved === "null") {
        setSelectedQuantities({});
        setItemPhotos({});
        setOrderNotes("");
      } else {
        try {
          setSelectedQuantities(JSON.parse(saved));
        } catch (_) {
          setSelectedQuantities({});
        }
      }
    };

    window.addEventListener("storage", handleCartReset);
    window.addEventListener("cart-cleared", handleCartReset);
    return () => {
      window.removeEventListener("storage", handleCartReset);
      window.removeEventListener("cart-cleared", handleCartReset);
    };
  }, []);

  // --- BACKEND CART SYNC ---
  const [hasLoadedCart, setHasLoadedCart] = useState(false);

  useEffect(() => {
    const loadCart = async () => {
      try {
        const userData = JSON.parse(localStorage.getItem("user") || "{}");
        const userId = userData._id || userData.id;
        const localSaved = localStorage.getItem("cart_quantities");
        const isLocallyEmpty =
          !localSaved || localSaved === "{}" || localSaved === "null";

        if (userId) {
          const cart = await authApi.getDraftCart(userId);
          // Only restore if backend actually has items AND local cart was not intentionally cleared
          if (
            cart &&
            Object.keys(cart).length > 0 &&
            cart.selectedQuantities &&
            Object.keys(cart.selectedQuantities).length > 0 &&
            !isLocallyEmpty
          ) {
            setSelectedQuantities(cart.selectedQuantities);
            if (
              cart.selectedTier &&
              (cart.selectedTier === "Essential" ||
                cart.selectedTier === "Heritage")
            ) {
              setSelectedTier(cart.selectedTier);
            }
            if (cart.isExpress !== undefined) setIsExpress(cart.isExpress);
            if (cart.pickup) {
              setSelectedPickup(cart.pickup.date || "");
              setPickupTime(cart.pickup.time || "");
              setPickupAddress(cart.pickup.address || null);
            }
            if (cart.delivery) {
              setSelectedDelivery(cart.delivery.date || "");
              setDeliveryTime(cart.delivery.time || "");
              setDropAddress(cart.delivery.address || null);
            }
            if (cart.orderNotes) setOrderNotes(cart.orderNotes);
            if (cart.itemPhotos) setItemPhotos(cart.itemPhotos);
          } else if (isLocallyEmpty) {
            setSelectedQuantities({});
          }
        }
        setHasLoadedCart(true);
      } catch (err) {
        console.error("Failed to load cart:", err);
        setHasLoadedCart(true);
      }
    };
    loadCart();
  }, []);

  // Sync effect
  useEffect(() => {
    if (!hasLoadedCart) return;

    const syncCart = async () => {
      try {
        const userData = JSON.parse(localStorage.getItem("user") || "{}");
        const userId = userData._id || userData.id;
        if (!userId) return;

        const cartData = {
          selectedQuantities,
          selectedTier,
          isExpress,
          pickup: {
            date: selectedPickup,
            time: pickupTime,
            address: pickupAddress,
          },
          delivery: {
            date: selectedDelivery,
            time: deliveryTime,
            address: dropAddress,
          },
          orderNotes,
          itemPhotos,
        };

        await authApi.updateDraftCart(userId, cartData);
      } catch (err) {
        console.error("Failed to sync cart:", err);
      }
    };

    const timeout = setTimeout(syncCart, 2000); // Debounce sync
    return () => clearTimeout(timeout);
  }, [
    selectedQuantities,
    selectedTier,
    isExpress,
    selectedPickup,
    pickupTime,
    selectedDelivery,
    deliveryTime,
    pickupAddress,
    dropAddress,
    orderNotes,
    itemPhotos,
    hasLoadedCart,
  ]);

  const fetchConfig = async () => {
    try {
      await shippingConfigApi.getConfig();

      const userData = JSON.parse(localStorage.getItem("user") || "{}");
      const userId = userData._id || userData.id;
      if (userId) {
        const profile = await authApi.getProfile(userId);

        // Update localStorage to keep it in sync with backend
        localStorage.setItem("user", JSON.stringify(profile));

        let addrList = [];
        const seenAddresses = new Set();

        if (profile.addresses && Array.isArray(profile.addresses)) {
          profile.addresses.forEach((a, idx) => {
            const aAddr = a.address?.trim() || "";
            const aType = (a.type || "").toUpperCase();

            // EXTREMELY STRICT FILTERING + DEDUPLICATION
            const isPlaceholder =
              aAddr.length < 15 ||
              aAddr.toLowerCase().includes("not set") ||
              aAddr.toLowerCase().includes("address line") ||
              aAddr.toLowerCase().includes("placeholder") ||
              aType === "PROFILE" ||
              aType === "NA";

            if (!isPlaceholder && !seenAddresses.has(aAddr.toLowerCase())) {
              seenAddresses.add(aAddr.toLowerCase());
              addrList.push({
                id: a._id || `addr_${idx}`,
                type: aType || "HOME",
                address: aAddr,
                location: a.location,
                isDefault: !!a.isDefault,
              });
            }
          });
        }

        setSavedAddresses(addrList);

        // Synchronize selected addresses
        if (addrList.length > 0) {
          const isPickupStillValid =
            pickupAddress && addrList.some((a) => a.id === pickupAddress.id);
          const defaultAddr = addrList.find((a) => a.isDefault);
          const finalPickupAddr =
            defaultAddr || (isPickupStillValid ? pickupAddress : addrList[0]);
          setPickupAddress(finalPickupAddr);
          if (finalPickupAddr) {
            updateGeofenceForAddress(finalPickupAddr.address);

            // Sync default address to useLocationStore
            let finalLat = finalPickupAddr.location?.lat || 0;
            let finalLng = finalPickupAddr.location?.lng || 0;

            if (!finalLat && !finalLng && finalPickupAddr.address) {
              try {
                const coords = await locationService.geocodeAddress(
                  finalPickupAddr.address,
                );
                if (coords) {
                  finalLat = coords.lat;
                  finalLng = coords.lng;
                }
              } catch (e) {
                console.error(
                  "[Geocoding] Error during default address load:",
                  e,
                );
              }
            }

            setLocation({
              fullAddress: finalPickupAddr.address,
              city: finalPickupAddr.city || "",
              area: finalPickupAddr.type || "HOME",
              lat: finalLat,
              lng: finalLng,
            });

            // Make sure the localStorage variable 'pickup_address' is also in sync
            const pickupAddressObj = {
              id: finalPickupAddr.id || finalPickupAddr._id,
              type: (finalPickupAddr.type || "HOME").toUpperCase(),
              address: finalPickupAddr.address,
              location: { lat: finalLat, lng: finalLng },
              isDefault: !!finalPickupAddr.isDefault,
            };
            localStorage.setItem(
              "pickup_address",
              JSON.stringify(pickupAddressObj),
            );
          }

          const isDropStillValid =
            dropAddress && addrList.some((a) => a.id === dropAddress.id);
          if (!isDropStillValid && isSameAsPickup)
            setDropAddress(finalPickupAddr || addrList[0]);
        } else {
          setPickupAddress(null);
          setDropAddress(null);
        }
      }
    } catch (err) {
      console.error("Error fetching delivery config/profile:", err);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchServices = async () => {
    try {
      // GST registration affects invoicing, not the customer service catalogue.
      // Fetch all categories to check which ones are active
      const activeCategoryIds = new Set();
      const activeCategoryNames = new Set();
      try {
        const allCats = await categoryApi.getAll();
        if (Array.isArray(allCats)) {
          allCats
            .filter((c) => c.isActive)
            .forEach((c) => {
              if (c._id) activeCategoryIds.add(c._id.toString());
              if (c.mainCategory)
                activeCategoryNames.add(c.mainCategory.trim().toLowerCase());
              if (c.subCategory)
                activeCategoryNames.add(c.subCategory.trim().toLowerCase());
            });
        }
      } catch (err) {
        console.error("Error loading active categories:", err);
      }

      let data = [];
      try {
        const [masterRes, customRes] = await Promise.all([
          masterServiceApi.getAll({
            serviceType: "individual",
            activeOnly: true,
          }),
          serviceApi.getAll({ approvedOnly: true, serviceType: "individual" }),
        ]);
        data = [
          ...(Array.isArray(masterRes)
            ? masterRes.map((s) => ({ ...s, isMaster: true }))
            : []),
          ...(Array.isArray(customRes)
            ? customRes.map((s) => ({ ...s, isMaster: false }))
            : []),
        ];
      } catch (err) {
        console.error("Fetch error:", err);
      }

      const filtered = data
        .map((s) => {
          const catObj = s.categoryId || s.category;
          return {
            ...s,
            name: s.name || s.itemName,
            mainCategory:
              catObj?.mainCategory ||
              (typeof catObj === "string" ? catObj : null),
            subCategoryName:
              catObj?.subCategory ||
              (typeof s.subCategory === "string"
                ? s.subCategory
                : s.subCategory?.name),
          };
        })
        .filter((s) => {
          const isActive =
            s.status === "Active" || s.isActive === true || s.active === true;
          const isApproved = s.isMaster || s.approvalStatus === "Approved";
          const target = (s.targetAudience || "both").toLowerCase();
          const isMatch =
            target === "both" ||
            target === "individual" ||
            !s.targetAudience;

          // Category must be active (check both ObjectId and category name string)
          const sCatId = s.categoryId?._id || s.categoryId;
          const catName =
            typeof s.category === "string"
              ? s.category.trim().toLowerCase()
              : (s.category?.mainCategory || s.mainCategory || "")
                  .trim()
                  .toLowerCase();

          let isCategoryActive = true;
          if (
            sCatId &&
            activeCategoryIds.size > 0 &&
            activeCategoryIds.has(sCatId.toString())
          ) {
            isCategoryActive = true;
          } else if (catName && activeCategoryNames.size > 0) {
            isCategoryActive = activeCategoryNames.has(catName);
          }

          const isCurrIndActive = s.isMaster
            ? String(s.curr_ind || "y").toLowerCase() === "y"
            : true;

          return (
            isActive &&
            isApproved &&
            isMatch &&
            isCategoryActive &&
            isCurrIndActive
          );
        });
      setServices(filtered);
    } catch (error) {
      console.error("Error fetching services:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      setCategoriesLoading(true);
      const data = await categoryApi.getMain();
      setCategories(data);
    } catch (error) {
      console.error("Error fetching categories:", error);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const handleCategoryClick = async (category) => {
    if (selectedCategory?._id === category._id) {
      setSelectedCategory(null);
      setSelectedSubCategory(null);
      setSubCategories([]);
    } else {
      setSelectedCategory(category);
      setSelectedSubCategory(null);
      try {
        const subData = await categoryApi.getSub(category._id);
        setSubCategories(subData);
      } catch (error) {
        console.error("Error fetching sub-categories:", error);
      }
    }
  };

  useEffect(() => {
    fetchServices();
    fetchCategories();
  }, []);

  const [showMoreServices, setShowMoreServices] = useState(false);

  const filteredServices = useMemo(() => {
    // If user has a location but no valid active zone, show services using global prices (fall back pricingFactor = 1)
    // if (location && !zone) return [];

    let result = services.filter((s) => {
      if (s.tier === "Heritage" && selectedTier !== "Heritage") return false;
      if (
        searchQuery &&
        !s.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
        return false;
      if (selectedCategory && s.mainCategory !== selectedCategory.name)
        return false;
      if (selectedSubCategory && s.subCategoryName !== selectedSubCategory.name)
        return false;
      return true;
    });
    if (
      !selectedCategory &&
      !selectedSubCategory &&
      !searchQuery &&
      !showMoreServices
    )
      return result.slice(0, 10);
    return result;
  }, [
    services,
    selectedTier,
    searchQuery,
    selectedCategory,
    selectedSubCategory,
    showMoreServices,
  ]);

  const updateQuantity = (id, delta) => {
    if (delta > 0 && !selectedTier) {
      toast.error("Please select a tier (ESSENTIAL or HERITAGE) first");
      return;
    }
    if (delta > 0 && !isLogisticsValid) {
      toast.error("Please select Pickup and Drop-off details first");
      setShowSlotPicker(true);
      return;
    }
    const current = selectedQuantities[id] || 0;
    const next = Math.max(0, current + delta);

    if (delta > 0) {
      const service = services.find(
        (s) => s._id?.toString() === id || s.id?.toString() === id,
      );
      if (service?.vendorId)
        localStorage.setItem("last_visited_vendor_id", service.vendorId);

      // Auto-open photo modal on quantity 0 -> 1 transition
      if (current === 0 && next === 1) {
        setActivePhotoService({ id, name: service?.name || service?.itemName });
      }
    }

    if (next === 0) {
      setItemPhotos((prev) => {
        const { [id]: _, ...rest } = prev;
        localStorage.setItem("item_photos", JSON.stringify(rest));
        return rest;
      });
    }

    setSelectedQuantities((prev) => {
      if (next === 0) {
        const { [id]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [id]: next };
    });
  };

  const cartItemsCount = useMemo(
    () => Object.values(selectedQuantities).reduce((acc, q) => acc + q, 0),
    [selectedQuantities],
  );
  const cartTotal = useMemo(() => {
    return Object.entries(selectedQuantities).reduce((acc, [id, q]) => {
      const service = services.find(
        (s) => s._id?.toString() === id || s.id?.toString() === id,
      );
      if (!service) return acc;
      const actualPrice =
        allowDiscount !== false
          ? service.discountedPrice || service.basePrice || 0
          : service.basePrice || 0;
      const isHeritage = selectedTier === "Heritage";
      const price =
        actualPrice *
        (pricingFactor || 1) *
        (isExpress ? expressMultiplier || 1 : 1) *
        (isHeritage ? heritageMultiplier || 1 : 1);
      return acc + price * q;
    }, 0);
  }, [
    selectedQuantities,
    services,
    pricingFactor,
    isExpress,
    expressMultiplier,
    selectedTier,
    heritageMultiplier,
  ]);

  const maxServiceTime = useMemo(() => {
    let max = 1;
    Object.keys(selectedQuantities).forEach((id) => {
      const s = services.find(
        (srv) => srv._id?.toString() === id || srv.id?.toString() === id,
      );
      if (s?.serviceTime && s.serviceTime > max) max = s.serviceTime;
    });
    return max;
  }, [selectedQuantities, services]);

  const minDeliveryHours = useMemo(() => {
    return isExpress ? 24 : Math.max(24, maxServiceTime * 24);
  }, [isExpress, maxServiceTime]);

  useEffect(() => {
    if (!selectedPickup) return;
    const pickupIndex = availableDates.findIndex(
      (d) => `${d.day}, ${d.date}` === selectedPickup,
    );
    if (pickupIndex !== -1) {
      const minDays = isExpress ? 1 : Math.max(1, maxServiceTime);
      const deliveryIndex = Math.min(
        pickupIndex + minDays,
        availableDates.length - 1,
      );
      const deliveryD = availableDates[deliveryIndex];
      if (deliveryD) {
        setSelectedDelivery(`${deliveryD.day}, ${deliveryD.date}`);
        if (!deliveryTime && pickupTime) setDeliveryTime(pickupTime);
      }
    }
  }, [selectedPickup, maxServiceTime, availableDates, pickupTime, isExpress]);

  // Validate that selected delivery slot maintains required minimum gap from pickup
  useEffect(() => {
    if (selectedPickup && pickupTime && selectedDelivery && deliveryTime) {
      const pDT = getSlotDateTime(selectedPickup, pickupTime);
      const dDT = getSlotDateTime(selectedDelivery, deliveryTime);
      if (pDT && dDT) {
        const diffH = (dDT - pDT) / (1000 * 60 * 60);
        if (diffH < minDeliveryHours) {
          setSelectedDelivery("");
          setDeliveryTime("");
          localStorage.removeItem("delivery_date");
          localStorage.removeItem("delivery_time");
        }
      }
    }
  }, [
    minDeliveryHours,
    selectedPickup,
    pickupTime,
    selectedDelivery,
    deliveryTime,
  ]);

  const handleCartClick = () => {
    if (!selectedTier) {
      toast.error("Please select a tier (ESSENTIAL or HERITAGE) first");
      return;
    }
    if (Object.keys(selectedQuantities).length === 0) {
      toast.error("Please select at least one service");
      return;
    }
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/user/auth");
      return;
    }

    // Enforce mandatory image uploads for any selected service
    for (const [id, qty] of Object.entries(selectedQuantities)) {
      if (qty > 0) {
        const photos = itemPhotos[id] || [];
        if (photos.length === 0) {
          const service = services.find(
            (s) => s._id?.toString() === id || s.id?.toString() === id,
          );
          toast.error(
            `Please upload at least one photo for "${service?.name || "selected service"}" before going to cart.`,
          );
          setActivePhotoService({
            id,
            name: service?.name || service?.itemName,
          });
          return;
        }
      }
    }

    navigate("/user/cart");
  };

  const _handleServiceClick = (serviceId, service, i) => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/user/auth");
      return;
    }
    navigate("/user/service-info", {
      state: {
        selectedService: {
          id: serviceId,
          _id: serviceId,
          name: service.name,
          title: service.name,
          desc: service.description,
          image: service.image,
          vendorId: service.vendorId,
          vendor: service.vendor,
          color: isHeritage
            ? "heritage"
            : i % 3 === 0
              ? "primary"
              : i % 3 === 1
                ? "secondary"
                : "tertiary",
          price: `₹${service.totalPrice}.00`,
          totalPrice: service.totalPrice,
          basePrice: service.basePrice,
          allowDiscount: allowDiscount !== false,
        },
      },
    });
    if (service.vendorId)
      localStorage.setItem("last_visited_vendor_id", service.vendorId);
  };

  const handleLiveLocation = async () => {
    const updateDetails = (data) => {
      setAddressDetails({
        line1: data.area || "",
        line2: data.subLocal || "",
        floor: "",
        landmark: "",
        pincode: data.pincode || "",
        city: data.city || "",
        state: data.state || "",
      });
    };

    if (location) {
      updateDetails(location);
      setShowAddressForm(true);
      return;
    }

    if (!navigator.geolocation) {
      await appDialog.alert("Geolocation not supported");
      return;
    }
    setIsLocating(true);
    locationService
      .getCurrentCoordinates()
      .then(async (coords) => {
        try {
          const addressData = await locationService.reverseGeocode(
            coords.lat,
            coords.lng,
          );
          updateDetails(addressData);
          setShowAddressForm(true);
        } catch (err) {
          console.error(err);
        } finally {
          setIsLocating(false);
        }
      })
      .catch(() => setIsLocating(false));
  };

  const isHeritage = selectedTier === "Heritage";

  const banners = useMemo(
    () => [
      {
        id: 1,
        title: isHeritage ? (
          <>
            Exquisite
            <br />
            Garment Care
          </>
        ) : (
          <>
            30% Off Your
            <br />
            First Order
          </>
        ),
        sub: isHeritage ? "Heritage Tier" : "Limited Era",
        bg: isHeritage
          ? "bg-gradient-to-br from-[#D4AF37] to-[#996515]"
          : "bg-primary-gradient",
      },
      {
        id: 2,
        title: (
          <>
            Experience
            <br />
            Heritage Care
          </>
        ),
        sub: "Premium Tier",
        bg: "bg-gradient-to-br from-[#D4AF37] to-[#996515]",
      },
    ],
    [isHeritage],
  );

  const [currentBanner, setCurrentBanner] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentBanner((prev) => (prev + 1) % banners.length);
    }, 5000);
    return () => clearInterval(timer);
  }, [banners.length]);

  const [deliveryConfirmed, setDeliveryConfirmed] = useState(
    () => localStorage.getItem("delivery_confirmed") === "true",
  );
  const isLogisticsValid = !!(
    selectedPickup &&
    pickupTime &&
    selectedDelivery &&
    deliveryTime &&
    pickupAddress &&
    dropAddress
  );

  // Persistence for Logistics States
  useEffect(() => {
    localStorage.setItem("delivery_confirmed", deliveryConfirmed);
    localStorage.setItem("pickup_date", selectedPickup);
    localStorage.setItem("pickup_time", pickupTime);
    localStorage.setItem("delivery_date", selectedDelivery);
    localStorage.setItem("delivery_time", deliveryTime);
    if (selectedTier) localStorage.setItem("selected_tier", selectedTier);
    if (isExpress !== null) localStorage.setItem("is_express", isExpress);
    if (pickupAddress)
      localStorage.setItem("pickup_address", JSON.stringify(pickupAddress));
    if (dropAddress)
      localStorage.setItem("drop_address", JSON.stringify(dropAddress));
  }, [
    deliveryConfirmed,
    selectedPickup,
    pickupTime,
    selectedDelivery,
    deliveryTime,
    selectedTier,
    isExpress,
    pickupAddress,
    dropAddress,
  ]);

  // Sync Drop Address if same as Pickup
  useEffect(() => {
    if (isSameAsPickup && pickupAddress) {
      setDropAddress(pickupAddress);
    }
  }, [isSameAsPickup, pickupAddress]);

  const handlePhotoFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0 || !activePhotoService) return;

    setUploading(true);
    setUploadProgress(0);
    try {
      const uploadedUrls = [];
      let currentFileIndex = 0;
      const token = localStorage.getItem("token");

      for (const file of files) {
        const url = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          const formData = new FormData();
          formData.append("media", file);

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const fileProgress = Math.round(
                (event.loaded / event.total) * 100,
              );
              const overallProgress = Math.round(
                (currentFileIndex * 100 + fileProgress) / files.length,
              );
              setUploadProgress(overallProgress);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const res = JSON.parse(xhr.responseText);
                resolve(res.url || res.fileUrl);
              } catch (_err) {
                reject(new Error("Invalid response"));
              }
            } else {
              let errMsg = `Upload failed (${xhr.status})`;
              try {
                const errData = JSON.parse(xhr.responseText);
                if (errData.message) errMsg = errData.message;
              } catch (_parseErr) {
                // Ignore JSON parse failure for error response
              }
              reject(new Error(errMsg));
            }
          };

          xhr.onerror = () => reject(new Error("Network error"));
          xhr.open("POST", `${BASE_URL}/media/upload`);
          if (token) {
            xhr.setRequestHeader("Authorization", `Bearer ${token}`);
          }
          xhr.send(formData);
        });

        if (url) {
          uploadedUrls.push(url);
        }
        currentFileIndex++;
      }

      setItemPhotos((prev) => {
        const updated = {
          ...prev,
          [activePhotoService.id]: [
            ...(prev[activePhotoService.id] || []),
            ...uploadedUrls,
          ],
        };
        localStorage.setItem("item_photos", JSON.stringify(updated));
        return updated;
      });

      toast.success("Photos uploaded successfully!");
    } catch (error) {
      console.error("Upload Error:", error);
      toast.error(error.message || "Failed to upload photos");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setActivePhotoService(null);
      e.target.value = ""; // Reset input
    }
  };

  const handleDeletePhoto = (serviceId, photoUrl) => {
    setItemPhotos((prev) => {
      const updated = {
        ...prev,
        [serviceId]: (prev[serviceId] || []).filter((url) => url !== photoUrl),
      };
      localStorage.setItem("item_photos", JSON.stringify(updated));
      return updated;
    });
    toast.success("Photo removed");
  };

  const StepWrapper = ({
    children,
    isLocked,
    stepNumber,
    label,
    isCompleted,
  }) => (
    <div
      className={`relative transition-all duration-500 ${isLocked ? "opacity-50 pointer-events-none grayscale" : "opacity-100"}`}>
      {isLocked && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center pointer-events-none">
          <div className="bg-white/80 backdrop-blur-sm p-3 rounded-full shadow-lg border border-slate-200">
            <span className="material-symbols-outlined text-slate-400 text-xl">
              lock
            </span>
          </div>
        </div>
      )}
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${isCompleted ? "bg-emerald-500 text-white" : isLocked ? "bg-slate-200 text-slate-400" : "bg-black text-white"}`}>
          {isCompleted ? (
            <span className="material-symbols-outlined text-[14px]">check</span>
          ) : (
            stepNumber
          )}
        </div>
        <span
          className={`text-[10px] font-black uppercase tracking-[0.2em] ${isLocked ? "text-slate-300" : "text-slate-900"}`}>
          {label}
        </span>
      </div>
      {children}
    </div>
  );

  return (
    <div className="min-h-[100dvh] flex flex-col text-slate-900">
      <main className="flex-1 pb-44 sm:pb-36 max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 py-3.5 sm:py-6">
        {/* 1. HERO PROMO BANNER */}
        <section className="mb-6 w-full">
          <div className="overflow-hidden rounded-3xl shadow-sm border border-slate-200/80">
            <AnimatePresence mode="wait">
              {dbBanner ? (
                <motion.div
                  key={dbBanner._id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="relative overflow-hidden flex flex-col justify-end min-h-[160px] sm:min-h-[220px] bg-slate-900 text-white">
                  {dbBanner.type === "image" ? (
                    <img
                      src={
                        dbBanner.url.startsWith("/uploads/")
                          ? UPLOADS_URL.replace("/uploads/", "") + dbBanner.url
                          : `${UPLOADS_URL}${dbBanner.url}`
                      }
                      alt={dbBanner.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <video
                      src={
                        dbBanner.url.startsWith("/uploads/")
                          ? UPLOADS_URL.replace("/uploads/", "") + dbBanner.url
                          : `${UPLOADS_URL}${dbBanner.url}`
                      }
                      className="absolute inset-0 w-full h-full object-cover"
                      autoPlay
                      loop
                      muted
                      playsInline
                    />
                  )}
                  {/* Visual Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/30 to-transparent z-0" />

                  <div className="relative z-10 p-6 sm:p-8">
                    <span className="inline-block px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-semibold uppercase tracking-wider text-white mb-2">
                      {dbBanner.notes || "Special Promotion"}
                    </span>
                    <h2 className="text-xl sm:text-3xl font-bold text-white leading-tight">
                      {dbBanner.title}
                    </h2>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={banners[currentBanner].id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`${banners[currentBanner].bg} p-6 sm:p-8 relative overflow-hidden flex flex-col justify-end min-h-[140px] sm:min-h-[180px] rounded-3xl`}>
                  <div className="relative z-10 max-w-xl">
                    <span className="inline-block px-2.5 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-medium uppercase tracking-wider text-white mb-2">
                      {banners[currentBanner].sub}
                    </span>
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-3 leading-tight">
                      {banners[currentBanner].title}
                    </h2>
                    <div className="flex gap-2">
                      {banners.map((_, i) => (
                        <div
                          key={i}
                          className={`h-1.5 rounded-full transition-all duration-300 ${i === currentBanner ? "w-8 bg-white" : "w-2 bg-white/40"}`}
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* 2. CONSOLIDATED CONTROLS: TIER SELECTOR & SCHEDULE SLOT */}
        <div className="flex items-center gap-2 mb-6 w-full">
          {/* Tier Switcher */}
          {["Essential", "Heritage"].map((tier) => {
            const isHeritageTab = tier === "Heritage";
            const isSelected = selectedTier === tier;
            return (
              <button
                key={tier}
                onClick={() => {
                  setSelectedTier(tier);
                  setDeliveryConfirmed(true);
                }}
                className={cn(
                  "flex items-center justify-center gap-1 px-3 sm:px-5 py-3 sm:py-3.5 rounded-full font-black text-[9px] sm:text-xs uppercase tracking-wide sm:tracking-widest transition-all cursor-pointer shrink-0 active:scale-95",
                  isSelected
                    ? "bg-slate-950 text-white shadow-lg shadow-slate-950/20"
                    : "bg-white text-slate-900 border border-slate-200 shadow-2xs hover:bg-slate-50",
                )}>
                {isHeritageTab && (
                  <Sparkles
                    size={13}
                    className={isSelected ? "text-amber-300 shrink-0" : "text-amber-600 shrink-0"}
                  />
                )}
                <span>{tier}</span>
              </button>
            );
          })}

          {/* Schedule Pickup & Drop-off Button */}
          <button
            disabled={!selectedTier}
            onClick={() => setShowSlotPicker(true)}
            className={cn(
              "flex-1 min-w-0 flex items-center justify-center gap-2 px-3 sm:px-4 py-3 sm:py-3.5 rounded-full transition-all cursor-pointer active:scale-95",
              !selectedTier
                ? "opacity-50 grayscale cursor-not-allowed bg-slate-100 text-slate-400"
                : "bg-slate-950 text-white shadow-lg shadow-slate-950/20 hover:bg-slate-800",
            )}>
            <Calendar size={15} className="shrink-0" />
            <div className="text-left min-w-0 truncate">
              <span className="text-[9px] sm:text-xs font-black uppercase tracking-wide sm:tracking-widest truncate">
                {selectedPickup
                  ? `${selectedPickup} · ${pickupTime || "Anytime"}`
                  : "Schedule Pickup & Drop-off"}
              </span>
            </div>
            {selectedDelivery && (
              <span className="hidden md:inline text-[10px] font-black uppercase tracking-widest opacity-70 ml-auto">
                Drop: {selectedDelivery}
              </span>
            )}
          </button>
        </div>

        {/* 3. SEARCH & CATEGORIES */}
        <div
          className={`space-y-4 mb-8 transition-opacity duration-300 ${!selectedTier ? "opacity-50 pointer-events-none" : "opacity-100"}`}>
          {/* Search Input */}
          <div className="relative w-full">
            <Search
              size={17}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200/90 rounded-2xl pl-11 pr-10 py-3 text-sm font-normal text-slate-900 placeholder:text-slate-400 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-900/10 shadow-2xs transition-all"
              placeholder={
                isHeritage
                  ? "Search heritage garments..."
                  : "Search services (e.g. Dry Cleaning, Cotton Shirt, Saree...)"
              }
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1">
                <X size={15} />
              </button>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="w-full">
            <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
              <button
                onClick={() => {
                  setSelectedCategory(null);
                  setSelectedSubCategory(null);
                }}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-colors cursor-pointer border",
                  !selectedCategory
                    ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                )}>
                All Services
              </button>

              {categoriesLoading
                ? [...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className="w-24 h-9 bg-slate-100 rounded-xl animate-pulse shrink-0"
                    />
                  ))
                : categories.map((cat) => {
                    const isSelected = selectedCategory?.name === cat.name;
                    return (
                      <button
                        key={cat.name}
                        onClick={() => handleCategoryClick(cat)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-colors cursor-pointer border",
                          isSelected
                            ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50",
                        )}>
                        {cat.name}
                      </button>
                    );
                  })}
            </div>

            {/* Subcategories (if available) */}
            <AnimatePresence>
              {subCategories.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="flex gap-2 overflow-x-auto hide-scrollbar pt-2.5 pb-1">
                  {subCategories.map((sub) => {
                    const isSelected = selectedSubCategory?._id === sub._id;
                    return (
                      <button
                        key={sub._id}
                        onClick={() =>
                          setSelectedSubCategory(
                            isSelected
                              ? null
                              : { ...sub, name: sub.subCategory },
                          )
                        }
                        className={cn(
                          "px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer border",
                          isSelected
                            ? "bg-slate-800 text-white border-slate-800"
                            : "bg-slate-100 text-slate-600 border-slate-200/60 hover:bg-slate-200/70",
                        )}>
                        {sub.subCategory}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 4. RESPONSIVE SERVICES CATALOG GRID */}
        <section className="mb-12 w-full">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="bg-white rounded-2xl p-5 h-36 border border-slate-200/80 animate-pulse"
                />
              ))}
            </div>
          ) : filteredServices.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-3xl border border-slate-200/80 p-8">
              <p className="text-base font-semibold text-slate-800">
                No services found
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Try adjusting your search query or category filter.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {filteredServices.map((service, i) => {
                const serviceId = service._id || service.id;
                const qty = selectedQuantities[serviceId] || 0;
                const isSelected = qty > 0;
                const photosCount = itemPhotos[serviceId]?.length || 0;

                const basePrice =
                  (allowDiscount !== false
                    ? service.discountedPrice || service.basePrice
                    : service.basePrice) || 0;
                const calculatedPrice = Math.round(
                  basePrice *
                    (pricingFactor || 1) *
                    (isExpress ? expressMultiplier || 1 : 1) *
                    (isHeritage ? heritageMultiplier || 1 : 1),
                );
                const originalPrice = Math.round(
                  (service.basePrice || 0) *
                    (pricingFactor || 1) *
                    (isExpress ? expressMultiplier || 1 : 1) *
                    (isHeritage ? heritageMultiplier || 1 : 1),
                );

                return (
                  <motion.div
                    key={serviceId}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.02, 0.3) }}
                    className={cn(
                      "bg-white rounded-2xl p-4 sm:p-5 flex flex-col justify-between border transition-all hover:shadow-sm group",
                      isSelected
                        ? "border-slate-900 ring-1 ring-slate-900/10 shadow-2xs"
                        : "border-slate-200/90 hover:border-slate-300",
                    )}>
                    {/* Top Details */}
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide bg-slate-100 px-2 py-0.5 rounded-md">
                          {service.mainCategory || "Service"}
                        </span>
                        {service.subCategoryName && (
                          <span className="text-[11px] text-slate-400 font-normal">
                            {service.subCategoryName}
                          </span>
                        )}
                      </div>

                      <h4 className="font-semibold text-sm sm:text-base text-slate-900 line-clamp-2 mt-2 leading-snug break-words">
                        {service.name || service.itemName}
                      </h4>
                    </div>

                    {/* Bottom Row: Price & Quantity Controls */}
                    <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100">
                      {/* Price Display */}
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-baseline gap-1.5 flex-wrap">
                          <span className="text-sm sm:text-base font-bold text-slate-900">
                            ₹{calculatedPrice}
                          </span>
                          {allowDiscount !== false &&
                            (service.basePrice || 0) >
                              (service.discountedPrice || 0) && (
                              <span className="text-[11px] font-normal line-through text-slate-400">
                                ₹{originalPrice}
                              </span>
                            )}
                        </div>
                      </div>

                      {/* Right Action: Quantity Stepper & Optional Camera */}
                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        {/* Camera photo upload trigger */}
                        {isSelected && (
                          <button
                            onClick={() =>
                              setActivePhotoService({
                                id: serviceId,
                                name: service.name || service.itemName,
                              })
                            }
                            className={cn(
                              "w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl flex items-center justify-center transition-colors cursor-pointer shrink-0",
                              photosCount > 0
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                : "bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-200",
                            )}
                            title="Upload garment photo">
                            <Camera size={13} className="sm:size-[14px]" />
                            {photosCount > 0 && (
                              <span className="ml-0.5 text-[9px] sm:text-[10px] font-bold text-emerald-800">
                                {photosCount}
                              </span>
                            )}
                          </button>
                        )}

                        {/* Quantity Stepper */}
                        <div className="flex items-center rounded-xl bg-slate-100/90 border border-slate-200/80 p-0.5 shrink-0">
                          <button
                            onClick={() => updateQuantity(serviceId, -1)}
                            className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-colors cursor-pointer">
                            <Minus size={12} className="sm:size-[13px]" />
                          </button>
                          <span className="text-xs font-semibold px-1.5 sm:px-2 min-w-[20px] sm:min-w-[24px] text-center text-slate-900">
                            {qty}
                          </span>
                          <button
                            onClick={() => updateQuantity(serviceId, 1)}
                            className="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-lg hover:bg-white text-slate-600 hover:text-slate-900 transition-colors cursor-pointer">
                            <Plus size={12} className="sm:size-[13px]" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {!showMoreServices &&
            !selectedCategory &&
            !selectedSubCategory &&
            !searchQuery &&
            filteredServices.length >= 12 && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={() => setShowMoreServices(true)}
                  className="px-6 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-medium text-xs hover:bg-slate-50 transition-colors shadow-2xs cursor-pointer">
                  View All Services
                </button>
              </div>
            )}
        </section>

        {/* 8. SLOT PICKER MODAL */}
        {/* 8. COMBINED PICKUP & DROP-OFF MODAL */}
        <AnimatePresence>
          {showSlotPicker && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowSlotPicker(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              />
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 15 }}
                className="relative w-full max-w-[380px] sm:max-w-[420px] bg-white rounded-[2rem] p-5 sm:p-6 shadow-2xl flex flex-col gap-4 max-h-[90vh] overflow-y-auto border border-slate-100">
                {/* Modal Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base sm:text-lg font-black tracking-tight text-slate-900 uppercase">
                      Select Logistics
                    </h3>
                    <p className="text-[11px] font-medium text-slate-400">
                      Choose pickup & drop-off slots
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSlotPicker(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 transition-colors cursor-pointer">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Delivery Type Toggle */}
                  <div className="bg-slate-100/80 p-1 rounded-2xl border border-slate-200/60 flex gap-1">
                    {["Normal", "Express"].map((type) => {
                      const active =
                        (type === "Express" && isExpress === true) ||
                        (type === "Normal" && isExpress === false);
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setIsExpress(type === "Express");
                            setDeliveryConfirmed(true);
                          }}
                          className={`flex-1 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-150 cursor-pointer ${
                            active
                              ? "bg-slate-950 text-white shadow-md"
                              : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/50"
                          }`}>
                          {type === "Normal"
                            ? "Normal Delivery"
                            : "Express Delivery"}
                        </button>
                      );
                    })}
                  </div>

                  {/* --- PICKUP SECTION --- */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                        <Calendar className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        1. Pickup
                      </span>
                    </div>

                    <div className="space-y-3 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100">
                      {/* Address Dropdown */}
                      <div className="relative">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 ml-0.5">
                          Select Address
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenDropdown(
                              openDropdown === "address" ? null : "address",
                            )
                          }
                          className="w-full bg-white px-3.5 py-2.5 rounded-xl border border-slate-200/80 text-xs font-semibold text-left flex justify-between items-center shadow-xs hover:border-slate-300 transition-all cursor-pointer">
                          <span
                            className={
                              pickupAddress
                                ? "text-slate-900 font-bold"
                                : "text-slate-400 font-normal"
                            }>
                            {pickupAddress
                              ? pickupAddress.type.toUpperCase()
                              : "Choose Address"}
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${openDropdown === "address" ? "rotate-180" : ""}`}
                          />
                        </button>

                        <AnimatePresence>
                          {openDropdown === "address" && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="absolute z-[250] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                              <div className="max-h-40 overflow-y-auto">
                                {savedAddresses.map((addr) => (
                                  <button
                                    key={addr.id}
                                    type="button"
                                    onClick={() => {
                                      setPickupAddress(addr);
                                      if (isSameAsPickup) setDropAddress(addr);
                                      setOpenDropdown(null);
                                      updateGeofenceForAddress(addr.address);
                                    }}
                                    className="w-full px-3.5 py-2.5 text-left text-xs font-semibold uppercase text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors cursor-pointer">
                                    {addr.type}
                                  </button>
                                ))}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveAddressType("pickup");
                                    setShowSlotPicker(false);
                                    setShowAddressForm(true);
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

                      {/* Pickup Date Dropdown */}
                      <div className="relative">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 ml-0.5">
                          Date
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenDropdown(
                              openDropdown === "date" ? null : "date",
                            )
                          }
                          className="w-full bg-white px-3.5 py-2.5 rounded-xl border border-slate-200/80 text-xs font-semibold text-left flex justify-between items-center shadow-xs hover:border-slate-300 transition-all cursor-pointer">
                          <span
                            className={
                              selectedPickup
                                ? "text-slate-900 font-bold"
                                : "text-slate-400 font-normal"
                            }>
                            {selectedPickup || "Select Date"}
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${openDropdown === "date" ? "rotate-180" : ""}`}
                          />
                        </button>

                        <AnimatePresence>
                          {openDropdown === "date" && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="absolute z-[250] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                              <div className="max-h-40 overflow-y-auto">
                                {availableDates.slice(0, 6).map((d, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
                                      setSelectedPickup(`${d.day}, ${d.date}`);
                                      setOpenDropdown(null);
                                    }}
                                    className="w-full px-3.5 py-2.5 text-left text-xs font-semibold uppercase text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors cursor-pointer">
                                    {d.day}, {d.date}
                                  </button>
                                ))}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Pickup Time Dropdown */}
                      <div className="relative">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 ml-0.5">
                          Time
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenDropdown(
                              openDropdown === "time" ? null : "time",
                            )
                          }
                          className="w-full bg-white px-3.5 py-2.5 rounded-xl border border-slate-200/80 text-xs font-semibold text-left flex justify-between items-center shadow-xs hover:border-slate-300 transition-all cursor-pointer">
                          <span
                            className={
                              pickupTime
                                ? "text-slate-900 font-bold"
                                : "text-slate-400 font-normal"
                            }>
                            {pickupTime || "Select Time"}
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${openDropdown === "time" ? "rotate-180" : ""}`}
                          />
                        </button>

                        <AnimatePresence>
                          {openDropdown === "time" && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="absolute z-[250] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                              <div className="max-h-40 overflow-y-auto">
                                {timeSlots
                                  .filter((slot) => {
                                    if (
                                      !selectedPickup ||
                                      !selectedPickup.startsWith("TODAY")
                                    )
                                      return true;
                                    const [timePart] = slot.split(" - ");
                                    const [time, modifier] =
                                      timePart.split(" ");
                                    let [hours] = time.split(":");
                                    let h = parseInt(hours, 10);
                                    if (h === 12) h = 0;
                                    if (modifier === "PM") h += 12;
                                    const now = new Date();
                                    const slotTime = new Date();
                                    slotTime.setHours(h, 0, 0, 0);
                                    return (
                                      slotTime >
                                      new Date(now.getTime() + 60 * 60 * 1000)
                                    );
                                  })
                                  .map((slot) => (
                                    <button
                                      key={slot}
                                      type="button"
                                      onClick={() => {
                                        setPickupTime(slot);
                                        setOpenDropdown(null);
                                      }}
                                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold uppercase text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors cursor-pointer">
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

                  {/* --- DROP-OFF SECTION --- */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 px-1">
                      <div className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                        <Truck className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                        2. Drop-off
                      </span>
                    </div>

                    <div className="space-y-3 bg-slate-50/80 p-3.5 rounded-2xl border border-slate-100">
                      {/* Same as Pickup Toggle */}
                      <div className="flex items-center justify-between px-1 py-0.5">
                        <span className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                          Same as Pickup Address
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const next = !isSameAsPickup;
                            setIsSameAsPickup(next);
                            if (next) setDropAddress(pickupAddress);
                          }}
                          className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${isSameAsPickup ? "bg-emerald-500" : "bg-slate-300"}`}>
                          <div
                            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200 ${isSameAsPickup ? "right-0.5" : "left-0.5"}`}
                          />
                        </button>
                      </div>

                      {/* Conditional Drop-off Address Dropdown */}
                      {!isSameAsPickup && (
                        <div className="relative pt-1 border-t border-slate-200/60">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 ml-0.5">
                            Drop-off Address
                          </span>
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
                                dropAddress &&
                                dropAddress.id !== pickupAddress?.id
                                  ? "text-slate-900 font-bold"
                                  : "text-slate-400 font-normal"
                              }>
                              {dropAddress &&
                              dropAddress.id !== pickupAddress?.id
                                ? dropAddress.type.toUpperCase()
                                : "Select Drop Address"}
                            </span>
                            <ChevronDown
                              className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${openDropdown === "dropAddress" ? "rotate-180" : ""}`}
                            />
                          </button>

                          <AnimatePresence>
                            {openDropdown === "dropAddress" && (
                              <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                className="absolute z-[250] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                                <div className="max-h-40 overflow-y-auto">
                                  {savedAddresses.map((addr) => (
                                    <button
                                      key={addr.id}
                                      type="button"
                                      onClick={() => {
                                        setDropAddress(addr);
                                        setOpenDropdown(null);
                                      }}
                                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold uppercase text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors cursor-pointer">
                                      {addr.type}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveAddressType("drop");
                                      setShowSlotPicker(false);
                                      setShowAddressForm(true);
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
                      )}

                      {/* Drop-off Date Dropdown */}
                      <div className="relative">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 ml-0.5">
                          Date
                        </span>
                        <button
                          type="button"
                          disabled={!selectedPickup || !pickupTime}
                          onClick={() =>
                            setOpenDropdown(
                              openDropdown === "dropDate" ? null : "dropDate",
                            )
                          }
                          className={`w-full bg-white px-3.5 py-2.5 rounded-xl border border-slate-200/80 text-xs font-semibold text-left flex justify-between items-center shadow-xs transition-all cursor-pointer ${
                            !selectedPickup || !pickupTime
                              ? "opacity-50 cursor-not-allowed bg-slate-100"
                              : "hover:border-slate-300"
                          }`}>
                          <span
                            className={
                              selectedDelivery
                                ? "text-slate-900 font-bold"
                                : "text-slate-400 font-normal"
                            }>
                            {!selectedPickup || !pickupTime
                              ? "Select Pickup First"
                              : selectedDelivery || "Select Date"}
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${openDropdown === "dropDate" ? "rotate-180" : ""}`}
                          />
                        </button>

                        <AnimatePresence>
                          {openDropdown === "dropDate" && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="absolute z-[250] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                              <div className="max-h-40 overflow-y-auto">
                                {availableDates
                                  .filter((d) => {
                                    if (!selectedPickup || !pickupTime)
                                      return true;
                                    const dateStr = `${d.day}, ${d.date}`;
                                    const pDT = getSlotDateTime(
                                      selectedPickup,
                                      pickupTime,
                                    );
                                    const lastSlotDT = getSlotDateTime(
                                      dateStr,
                                      timeSlots[timeSlots.length - 1],
                                    );
                                    return (
                                      (lastSlotDT - pDT) / (1000 * 60 * 60) >=
                                      minDeliveryHours
                                    );
                                  })
                                  .map((d, i) => {
                                    const dateStr = `${d.day}, ${d.date}`;
                                    return (
                                      <button
                                        key={i}
                                        type="button"
                                        onClick={() => {
                                          setSelectedDelivery(dateStr);
                                          setOpenDropdown(null);
                                        }}
                                        className="w-full px-3.5 py-2.5 text-left text-xs font-semibold uppercase text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors cursor-pointer">
                                        {d.day}, {d.date}
                                      </button>
                                    );
                                  })}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Drop-off Time Dropdown */}
                      <div className="relative">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 ml-0.5">
                          Time
                        </span>
                        <button
                          type="button"
                          disabled={
                            !selectedPickup || !pickupTime || !selectedDelivery
                          }
                          onClick={() =>
                            setOpenDropdown(
                              openDropdown === "dropTime" ? null : "dropTime",
                            )
                          }
                          className={`w-full bg-white px-3.5 py-2.5 rounded-xl border border-slate-200/80 text-xs font-semibold text-left flex justify-between items-center shadow-xs transition-all cursor-pointer ${
                            !selectedPickup || !pickupTime || !selectedDelivery
                              ? "opacity-50 cursor-not-allowed bg-slate-100"
                              : "hover:border-slate-300"
                          }`}>
                          <span
                            className={
                              deliveryTime
                                ? "text-slate-900 font-bold"
                                : "text-slate-400 font-normal"
                            }>
                            {!selectedPickup || !pickupTime || !selectedDelivery
                              ? "Select Pickup/Date First"
                              : deliveryTime || "Select Time"}
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${openDropdown === "dropTime" ? "rotate-180" : ""}`}
                          />
                        </button>

                        <AnimatePresence>
                          {openDropdown === "dropTime" && (
                            <motion.div
                              initial={{ opacity: 0, y: -5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -5 }}
                              className="absolute z-[250] top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                              <div className="max-h-40 overflow-y-auto">
                                {timeSlots
                                  .filter((slot) => {
                                    if (
                                      !selectedPickup ||
                                      !pickupTime ||
                                      !selectedDelivery
                                    )
                                      return true;
                                    const pDT = getSlotDateTime(
                                      selectedPickup,
                                      pickupTime,
                                    );
                                    const dDT = getSlotDateTime(
                                      selectedDelivery,
                                      slot,
                                    );
                                    return (
                                      (dDT - pDT) / (1000 * 60 * 60) >=
                                      minDeliveryHours
                                    );
                                  })
                                  .map((slot) => (
                                    <button
                                      key={slot}
                                      type="button"
                                      onClick={() => {
                                        setDeliveryTime(slot);
                                        setOpenDropdown(null);
                                      }}
                                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold uppercase text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors cursor-pointer">
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

                {/* Confirm Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (!pickupAddress) {
                      toast.error("Please select a pickup address");
                      return;
                    }
                    if (!selectedPickup || !pickupTime) {
                      toast.error("Please select pickup date & time");
                      return;
                    }
                    if (!dropAddress) {
                      toast.error("Please select a drop-off address");
                      return;
                    }
                    if (!selectedDelivery || !deliveryTime) {
                      toast.error("Please select drop-off date & time");
                      return;
                    }
                    setDeliveryConfirmed(true);
                    toast.success("Logistics confirmed!");
                    setShowSlotPicker(false);
                  }}
                  className="w-full bg-slate-950 hover:bg-slate-900 text-white py-3.5 rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl shadow-slate-950/20 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2 mt-1">
                  <Check className="w-4 h-4" />
                  <span>Confirm Logistics</span>
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 9. ADDRESS PICKER MODAL */}
        <AnimatePresence>
          {showAddressPicker && (
            <div className="fixed inset-0 z-[210] flex items-end justify-center p-0">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAddressPicker(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                className="relative w-full max-w-lg bg-white rounded-t-[3rem] p-8 shadow-2xl flex flex-col gap-6 overflow-y-auto max-h-[85vh] hide-scrollbar">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black tracking-tighter uppercase leading-none">
                    CHOOSE <br />
                    {activeAddressType} ADDRESS.
                  </h3>
                  <button
                    onClick={() => setShowAddressPicker(false)}
                    className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <div className="space-y-4">
                  {savedAddresses.length > 0 ? (
                    savedAddresses.map((addr) => (
                      <button
                        key={addr.id}
                        onClick={() => {
                          if (activeAddressType === "pickup") {
                            setPickupAddress(addr);
                            if (isSameAsPickup) setDropAddress(addr);
                          } else {
                            setDropAddress(addr);
                          }
                          setShowAddressPicker(false);
                        }}
                        className={`w-full p-4 rounded-2xl border-2 text-left flex items-start gap-3 transition-all ${(activeAddressType === "pickup" ? pickupAddress : dropAddress)?.id === addr.id ? "border-black bg-slate-50" : "border-slate-100"}`}>
                        <span className="material-symbols-outlined text-slate-400">
                          location_on
                        </span>
                        <div>
                          <p className="text-[11px] font-black uppercase text-slate-900">
                            {addr.type}
                          </p>
                          <p className="text-[10px] font-bold text-slate-500 mt-1 line-clamp-2">
                            {addr.address || addr.fullAddress}
                          </p>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="py-10 text-center">
                      <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">
                        No saved addresses found
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => {
                      setShowAddressPicker(false);
                      setShowAddressForm(true);
                    }}
                    className="w-full p-6 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 flex items-center justify-center gap-2 hover:border-slate-900 hover:text-slate-900 transition-all">
                    <span className="material-symbols-outlined">add</span>
                    <span className="text-[10px] font-black uppercase tracking-widest">
                      Add New Address
                    </span>
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* 10. ADDRESS FORM MODAL (FORMAT) */}
        <AnimatePresence>
          {showAddressForm && (
            <div className="fixed inset-0 z-[220] flex items-end justify-center p-0">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAddressForm(false)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                className="relative w-full max-w-lg bg-white rounded-t-[3rem] p-8 shadow-2xl flex flex-col gap-6 overflow-y-auto max-h-[90vh] hide-scrollbar">
                <div className="flex justify-between items-center">
                  <h3 className="text-2xl font-black tracking-tighter uppercase leading-none">
                    ENTER NEW <br />
                    ADDRESS.
                  </h3>
                  <button
                    onClick={() => setShowAddressForm(false)}
                    className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-400">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <div className="space-y-6">
                  {/* Address Type */}
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                      Address Type
                    </p>
                    <div className="flex gap-2">
                      {["Home", "Office", "Other"].map((t) => {
                        const isAlreadyPresent = savedAddresses.some(
                          (addr) =>
                            addr.type?.toLowerCase() === t.toLowerCase(),
                        );
                        const isDisabled = isAlreadyPresent;

                        return (
                          <button
                            key={t}
                            disabled={isDisabled}
                            onClick={() =>
                              setAddressFormData((prev) => ({
                                ...prev,
                                type: t,
                              }))
                            }
                            className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest border transition-all flex flex-col items-center justify-center gap-0.5
                              ${
                                isDisabled
                                  ? "opacity-30 grayscale cursor-not-allowed bg-slate-50 text-slate-300 border-slate-100"
                                  : addressFormData.type === t
                                    ? "bg-black text-white border-black shadow-lg shadow-black/20"
                                    : "bg-white text-slate-400 border-slate-100 hover:border-slate-200"
                              }`}>
                            <span>{t}</span>
                            {isDisabled && (
                              <span className="text-[6px] opacity-60 tracking-tight font-bold">
                                (SAVED)
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Structured Address Inputs */}
                  <div className="space-y-4">
                    {/* Line 1 */}
                    <div className="space-y-1.5">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Address Line 1
                      </p>
                      <input
                        type="text"
                        value={addressDetails.line1}
                        onChange={(e) =>
                          setAddressDetails((prev) => ({
                            ...prev,
                            line1: e.target.value,
                          }))
                        }
                        placeholder="Flat/House No, Building Name"
                        className="w-full bg-slate-50 border border-slate-100 px-4 py-3.5 rounded-xl text-[10px] font-black text-slate-900 outline-none focus:bg-white focus:border-slate-950 transition-all shadow-sm"
                      />
                    </div>

                    {/* Line 2 */}
                    <div className="space-y-1.5">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        Address Line 2
                      </p>
                      <input
                        type="text"
                        value={addressDetails.line2}
                        onChange={(e) =>
                          setAddressDetails((prev) => ({
                            ...prev,
                            line2: e.target.value,
                          }))
                        }
                        placeholder="Street, Area Name"
                        className="w-full bg-slate-50 border border-slate-100 px-4 py-3.5 rounded-xl text-[10px] font-black text-slate-900 outline-none focus:bg-white focus:border-slate-950 transition-all shadow-sm"
                      />
                    </div>

                    {/* Floor & Landmark */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">
                          Floor / Apt
                        </p>
                        <input
                          type="text"
                          value={addressDetails.floor}
                          onChange={(e) =>
                            setAddressDetails((prev) => ({
                              ...prev,
                              floor: e.target.value,
                            }))
                          }
                          placeholder="e.g. 4th Floor"
                          className="w-full bg-slate-50 border border-slate-100 px-4 py-3.5 rounded-xl text-[10px] font-black text-slate-900 outline-none shadow-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">
                          Landmark
                        </p>
                        <input
                          type="text"
                          value={addressDetails.landmark}
                          onChange={(e) =>
                            setAddressDetails((prev) => ({
                              ...prev,
                              landmark: e.target.value,
                            }))
                          }
                          placeholder="Near Temple/Gym"
                          className="w-full bg-slate-50 border border-slate-100 px-4 py-3.5 rounded-xl text-[10px] font-black text-slate-900 outline-none shadow-sm"
                        />
                      </div>
                    </div>

                    {/* Pincode & City */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">
                          Pincode
                        </p>
                        <input
                          type="text"
                          value={addressDetails.pincode}
                          onChange={(e) =>
                            setAddressDetails((prev) => ({
                              ...prev,
                              pincode: e.target.value,
                            }))
                          }
                          placeholder="6-digit ZIP"
                          className="w-full bg-slate-50 border border-slate-100 px-4 py-3.5 rounded-xl text-[10px] font-black text-slate-900 outline-none shadow-sm"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">
                          City
                        </p>
                        <input
                          type="text"
                          value={addressDetails.city}
                          onChange={(e) =>
                            setAddressDetails((prev) => ({
                              ...prev,
                              city: e.target.value,
                            }))
                          }
                          placeholder="City Name"
                          className="w-full bg-slate-50 border border-slate-100 px-4 py-3.5 rounded-xl text-[10px] font-black text-slate-900 outline-none shadow-sm"
                        />
                      </div>
                    </div>

                    {/* State */}
                    <div className="space-y-1.5">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest ml-1">
                        State
                      </p>
                      <input
                        type="text"
                        value={addressDetails.state}
                        onChange={(e) =>
                          setAddressDetails((prev) => ({
                            ...prev,
                            state: e.target.value,
                          }))
                        }
                        placeholder="State Name"
                        className="w-full bg-slate-50 border border-slate-100 px-4 py-3.5 rounded-xl text-[10px] font-black text-slate-900 outline-none shadow-sm"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleLiveLocation}
                    className="flex items-center gap-2 text-emerald-600 font-black text-[10px] uppercase tracking-widest">
                    <span className="material-symbols-outlined text-lg">
                      my_location
                    </span>
                    {isLocating ? "Locating..." : "Use Current Location"}
                  </button>

                  <button
                    onClick={handleSaveCustomAddress}
                    className="w-full bg-black text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em]">
                    SAVE & USE ADDRESS
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {cartItemsCount > 0 && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              className="fixed bottom-20 left-0 right-0 z-[150] px-3 sm:px-4 pointer-events-none flex justify-center">
              <div className="pointer-events-auto bg-slate-900 text-white px-3.5 sm:px-5 py-2.5 sm:py-3.5 rounded-2xl shadow-2xl border border-white/10 flex items-center justify-between gap-3 sm:gap-6 w-full max-w-md backdrop-blur-xl">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
                    <ShoppingBag
                      size={16}
                      className="text-white sm:size-[18px]"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="text-xs sm:text-sm font-semibold text-white truncate">
                        {cartItemsCount}{" "}
                        {cartItemsCount === 1 ? "item" : "items"}
                      </span>
                      <span className="text-xs text-white/40">·</span>
                      <span className="text-xs sm:text-sm font-bold text-emerald-400 shrink-0">
                        ₹{Math.round(cartTotal)}
                      </span>
                    </div>
                    <p className="text-[10px] sm:text-[11px] text-white/60 font-normal truncate">
                      Tier: {selectedTier || "Essential"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleCartClick}
                  className="px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-white text-slate-950 font-semibold text-xs sm:text-sm hover:bg-slate-100 transition-all flex items-center gap-1.5 sm:gap-2 shrink-0 cursor-pointer shadow-sm active:scale-95">
                  <span>Review & Pay</span>
                  <ArrowRight size={13} className="sm:size-[15px]" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 11. PHOTO OPTIONS & MANAGEMENT MODAL */}
        <AnimatePresence>
          {activePhotoService && (
            <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActivePhotoService(null)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
              />
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 10 }}
                className="relative w-full max-w-md bg-white rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 text-slate-900 space-y-5 max-h-[90vh] overflow-y-auto hide-scrollbar">
                {/* Modal Header */}
                <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold mb-1">
                      <Camera size={12} />
                      <span>Garment Care Photos</span>
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                      Photos for {activePhotoService.name}
                    </h3>
                    <p className="text-xs text-slate-500 font-normal mt-0.5">
                      Add photos showing stains, tears, or specific care notes.
                    </p>
                  </div>
                  <button
                    onClick={() => setActivePhotoService(null)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors cursor-pointer shrink-0 mt-0.5">
                    <X size={16} />
                  </button>
                </div>

                {/* Upload Progress Bar */}
                {uploading && (
                  <div className="w-full space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex justify-between text-xs font-medium text-slate-600">
                      <span className="flex items-center gap-1.5">
                        <div className="w-3 h-3 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                        Uploading photos...
                      </span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-slate-900 transition-all duration-300 rounded-full"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Photos Grid or Empty Dropzone */}
                {itemPhotos[activePhotoService.id]?.length > 0 ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {itemPhotos[activePhotoService.id].map((photo, idx) => (
                        <div
                          key={idx}
                          className="relative aspect-square rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 group shadow-2xs">
                          <img
                            src={photo}
                            alt=""
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleDeletePhoto(activePhotoService.id, photo)
                            }
                            title="Delete Photo"
                            className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/95 text-rose-600 hover:bg-rose-50 border border-slate-200/80 shadow-xs flex items-center justify-center active:scale-90 transition-all cursor-pointer">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}

                      {/* Add More Tile */}
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current.click()}
                        className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 hover:border-slate-400 bg-slate-50/60 hover:bg-slate-50 flex flex-col items-center justify-center gap-1.5 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer group">
                        <div className="w-8 h-8 rounded-full bg-white shadow-2xs border border-slate-200/80 flex items-center justify-center text-slate-700 group-hover:scale-110 transition-transform">
                          <Plus size={16} />
                        </div>
                        <span className="text-xs font-medium">Add More</span>
                      </button>
                    </div>

                    {/* Modal Bottom Action Controls */}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={async () => {
                          if (
                            await appDialog.confirm("Delete all photos for this item?")
                          ) {
                            setItemPhotos((prev) => {
                              const { [activePhotoService.id]: _, ...rest } =
                                prev;
                              localStorage.setItem(
                                "item_photos",
                                JSON.stringify(rest),
                              );
                              return rest;
                            });
                            toast.success("All photos removed");
                          }
                        }}
                        className="text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5">
                        <Trash2 size={13} />
                        <span>Delete All</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setActivePhotoService(null)}
                        className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5">
                        <CheckCircle2 size={14} />
                        <span>Done</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  /* No Photos Upload Options */
                  <div className="space-y-4 py-2">
                    {/* Two-button layout */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Take Photo — opens native camera */}
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current.click()}
                        className="flex flex-col items-center justify-center gap-2.5 p-5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl transition-all cursor-pointer group active:scale-95">
                        <div className="w-11 h-11 rounded-2xl bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors">
                          <Camera size={22} />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold">Take Photo</p>
                          <p className="text-[10px] text-white/60 font-normal mt-0.5">
                            Open camera
                          </p>
                        </div>
                      </button>

                      {/* Select from Gallery */}
                      <button
                        type="button"
                        onClick={() => galleryInputRef.current.click()}
                        className="flex flex-col items-center justify-center gap-2.5 p-5 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-2xl border border-slate-200 hover:border-slate-300 transition-all cursor-pointer group active:scale-95">
                        <div className="w-11 h-11 rounded-2xl bg-white shadow-xs border border-slate-200 flex items-center justify-center text-slate-600 group-hover:border-slate-300 transition-colors">
                          <span className="material-symbols-outlined text-xl">
                            photo_library
                          </span>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold">From Gallery</p>
                          <p className="text-[10px] text-slate-400 font-normal mt-0.5">
                            Browse files
                          </p>
                        </div>
                      </button>
                    </div>

                    <p className="text-center text-[11px] text-slate-400">
                      PNG, JPG, HEIC · up to 10 MB each
                    </p>
                  </div>
                )}
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
      </main>
    </div>
  );
};

export default HomePage;
