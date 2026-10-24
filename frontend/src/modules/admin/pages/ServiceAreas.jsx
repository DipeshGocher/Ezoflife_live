import { appDialog } from '../../../shared/stores/appDialogStore';
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  Map as MapIcon,
  MapPin,
  Plus,
  Trash2,
  Save,
  X,
  Layers,
  Info,
  CheckCircle,
  AlertTriangle,
  Search,
  Navigation,
  Edit2,
  ChevronRight,
  ZapIcon,
  Percent,
  Shield,
  TrendingUp,
  Circle,
  Eye,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  GoogleMap,
  useJsApiLoader,
  DrawingManager,
  Polygon,
  Autocomplete,
  Marker,
  InfoWindow,
} from "@react-google-maps/api";
import { GOOGLE_MAPS_LOADER_OPTIONS } from "../../../lib/googleMaps";
import PageHeader from "../components/common/PageHeader";
import toast from "react-hot-toast";
import { BASE_URL } from "../../../lib/api";
import { FilterLabel } from "../components/common/FilterLabel";

const mapContainerStyle = { width: "100%", height: "100%" };
const defaultCenter = { lat: 19.9975, lng: 73.7898 }; // Nashik default

// Random nice colors for zones
const ZONE_COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

export default function ServiceAreas() {
  const [areas, setAreas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Mode: null | 'configure'
  const [mode, setMode] = useState(null);

  // The area being configured (new or existing)
  const [selectedArea, setSelectedArea] = useState(null);

  // Interactive boundary editing on Google Map
  const [isBoundaryEditing, setIsBoundaryEditing] = useState(false);
  const [liveVertexCount, setLiveVertexCount] = useState(0);

  // Serviced pincode management
  const [newPincodeInput, setNewPincodeInput] = useState("");
  const [detectingPincodes, setDetectingPincodes] = useState(false);

  // Ref to the Polygon instance being edited so we can read its path on save
  const editPolygonRef = useRef(null);

  // Initial coords before editing (for reset support)
  const originalCoordsRef = useRef(null);

  // Ref to the google map
  const mapRef = useRef(null);

  // Autocomplete ref
  const autocompleteRef = useRef(null);

  const handlePlaceChanged = () => {
    if (autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace();
      if (place && place.geometry && place.geometry.location) {
        const location = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        };
        setSearchedLocation(location);
        if (mapRef.current) {
          mapRef.current.panTo(location);
          mapRef.current.setZoom(15);
        }
      } else {
        toast.error("Location not found or has no coordinates");
      }
    }
  };

  // Whether drawing mode is active
  const [drawingMode, setDrawingMode] = useState(null);

  // Search filter
  const [search, setSearch] = useState("");

  // Searched location marker
  const [searchedLocation, setSearchedLocation] = useState(null);

  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS);

  // ─── Fetch all areas ───────────────────────────────────────────────────────
  const fetchAreas = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/geofence/areas`);
      const data = await res.json();
      setAreas(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error("Failed to load service areas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAreas();
  }, [fetchAreas]);

  // ─── Handle redirect parameters for vendor geofencing ────────────────────
  useEffect(() => {
    if (isLoaded) {
      const params = new URLSearchParams(window.location.search);
      const latParam = parseFloat(params.get("lat"));
      const lngParam = parseFloat(params.get("lng"));
      const nameParam = params.get("name");

      if (!isNaN(latParam) && !isNaN(lngParam)) {
        const vendorLoc = { lat: latParam, lng: lngParam };
        setSearchedLocation(vendorLoc);

        toast(
          `Location Target: ${decodeURIComponent(nameParam || "Vendor Location")}`,
          {
            icon: "📍",
            duration: 5000,
            style: { fontSize: "11px", fontWeight: 700 },
          },
        );

        // Try panning immediately, and retry slightly later to ensure mapRef.current is ready
        const doPan = () => {
          if (mapRef.current) {
            mapRef.current.panTo(vendorLoc);
            mapRef.current.setZoom(16);
            return true;
          }
          return false;
        };

        if (!doPan()) {
          const interval = setInterval(() => {
            if (doPan()) clearInterval(interval);
          }, 300);
          setTimeout(() => clearInterval(interval), 3000); // safety timeout
        }
      }
    }
  }, [isLoaded]);

  // ─── Helper: extract GeoJSON coords from area ──────────────────────────────
  const getCoords = (area) => area?.boundary?.coordinates?.[0] || [];

  // ─── Helper: coords → Google LatLng paths (strip duplicate closing point) ───
  const toGooglePaths = (coords) => {
    if (!coords || coords.length === 0) return [];
    let pts = coords;
    // Strip duplicate closing point so Google Maps vertex handles don't stack
    if (
      pts.length > 3 &&
      pts[0][0] === pts[pts.length - 1][0] &&
      pts[0][1] === pts[pts.length - 1][1]
    ) {
      pts = pts.slice(0, -1);
    }
    return pts.map((c) => ({ lat: c[1], lng: c[0] }));
  };

  // ─── Compute map center from coords ───────────────────────────────────────
  const computeCenter = (coords) => {
    if (!coords || coords.length === 0) return defaultCenter;
    const lats = coords.map((c) => c[1]);
    const lngs = coords.map((c) => c[0]);
    return {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    };
  };

  // ─── Pan map to an area ────────────────────────────────────────────────────
  const panToArea = (area) => {
    if (!mapRef.current) return;
    const center = computeCenter(getCoords(area));
    mapRef.current.panTo(center);
    mapRef.current.setZoom(14);
    setSearchedLocation(null);
  };

  // ─── Open Zone Configuration (Edit Details) ───────────────────────────────
  const handleConfigureArea = (area) => {
    setDrawingMode(null);
    const coords = getCoords(area);
    originalCoordsRef.current = JSON.parse(JSON.stringify(coords));
    setSelectedArea({
      ...area,
      name: area.areaName,
      coordinates: coords,
    });
    setLiveVertexCount(coords.length > 1 ? coords.length - 1 : coords.length);
    setIsBoundaryEditing(false);
    setMode("configure");
    panToArea(area);
  };

  // ─── Open Zone & Start Editing Boundary Directly ─────────────────────────
  const handleEditBoundary = (area) => {
    setDrawingMode(null);
    const coords = getCoords(area);
    originalCoordsRef.current = JSON.parse(JSON.stringify(coords));
    setSelectedArea({
      ...area,
      name: area.areaName,
      coordinates: coords,
    });
    setLiveVertexCount(coords.length > 1 ? coords.length - 1 : coords.length);
    setIsBoundaryEditing(true);
    setMode("configure");
    panToArea(area);
    toast(
      "Drag the polygon handles to reshape the boundary. Right-click any vertex to delete.",
      {
        icon: "✏️",
        duration: 5000,
        style: { fontSize: "11px", fontWeight: 700 },
      },
    );
  };

  // ─── Toggle boundary editing mode while in configure panel ────────────────
  const toggleBoundaryEditing = () => {
    if (!selectedArea) return;
    if (isBoundaryEditing) {
      const latest = collectEditedCoords();
      if (latest) {
        setSelectedArea((prev) => ({ ...prev, coordinates: latest }));
      }
      setIsBoundaryEditing(false);
      toast.success(
        'Boundary shape pinned. Click "Save All Changes" to persist.',
      );
    } else {
      setIsBoundaryEditing(true);
      panToArea(selectedArea);
      toast("Drag handles on map to reshape. Right-click vertex to delete.", {
        icon: "✏️",
        duration: 4000,
      });
    }
  };

  // ─── Reset boundary to initial coordinates ────────────────────────────────
  const handleResetBoundary = () => {
    if (!originalCoordsRef.current || originalCoordsRef.current.length < 3)
      return;
    setSelectedArea((prev) => ({
      ...prev,
      coordinates: JSON.parse(JSON.stringify(originalCoordsRef.current)),
    }));
    setLiveVertexCount(
      originalCoordsRef.current.length > 1
        ? originalCoordsRef.current.length - 1
        : originalCoordsRef.current.length,
    );
    toast("Boundary reset to original shape", { icon: "🔄" });
  };

  // ─── Collect edited polygon path from Google Maps ref ─────────────────────
  const collectEditedCoords = () => {
    if (!editPolygonRef.current) return null;
    const path = editPolygonRef.current.getPath();
    if (!path || path.getLength() < 3) return null;
    const coords = [];
    for (let i = 0; i < path.getLength(); i++) {
      const pt = path.getAt(i);
      coords.push([pt.lng(), pt.lat()]);
    }
    // Close polygon for GeoJSON Polygon format
    coords.push([coords[0][0], coords[0][1]]);
    return coords;
  };

  // ─── Auto-detect pincodes from polygon boundary using Geocoder ───────────
  const handleAutoDetectPincodes = async () => {
    const coords =
      isBoundaryEditing && editPolygonRef.current
        ? collectEditedCoords()
        : selectedArea?.coordinates || getCoords(selectedArea);

    if (!coords || coords.length < 3) {
      toast.error("Polygon coordinates missing");
      return;
    }

    if (!window.google?.maps?.Geocoder) {
      toast.error("Google Maps Geocoder not ready");
      return;
    }

    setDetectingPincodes(true);
    const geocoder = new window.google.maps.Geocoder();
    const googlePoints = coords.map(
      (c) => new window.google.maps.LatLng(c[1], c[0]),
    );
    const bounds = new window.google.maps.LatLngBounds();
    googlePoints.forEach((p) => bounds.extend(p));
    const center = bounds.getCenter();

    // Sample the center and up to 8 vertices
    const sampleLocs = [
      center,
      ...googlePoints.slice(0, Math.min(googlePoints.length, 8)),
    ];
    const detected = new Set(selectedArea?.pincodes || []);
    let newFound = 0;

    for (const loc of sampleLocs) {
      try {
        const response = await new Promise((resolve) => {
          geocoder.geocode({ location: loc }, (results, status) => {
            if (status === "OK") resolve(results);
            else resolve([]);
          });
        });
        if (response && response[0]) {
          const pc = response[0].address_components?.find((c) =>
            c.types.includes("postal_code"),
          );
          if (pc?.long_name && !detected.has(pc.long_name)) {
            detected.add(pc.long_name);
            newFound++;
          }
        }
      } catch (_) {}
    }

    setSelectedArea((prev) => ({ ...prev, pincodes: Array.from(detected) }));
    setDetectingPincodes(false);
    if (newFound > 0) {
      toast.success(`Detected ${newFound} additional pincode(s) ✓`);
    } else {
      toast("No new pincodes detected in this area");
    }
  };

  // ─── Pincode additions & removals ─────────────────────────────────────────
  const handleAddPincode = () => {
    const trimmed = newPincodeInput.trim();
    if (!trimmed || trimmed.length !== 6 || isNaN(trimmed)) {
      toast.error("Please enter a valid 6-digit pincode");
      return;
    }
    const current = selectedArea?.pincodes || [];
    if (current.includes(trimmed)) {
      toast.error("Pincode already added");
      return;
    }
    setSelectedArea((prev) => ({
      ...prev,
      pincodes: [...current, trimmed],
    }));
    setNewPincodeInput("");
  };

  const handleRemovePincode = (codeToRemove) => {
    setSelectedArea((prev) => ({
      ...prev,
      pincodes: (prev?.pincodes || []).filter((p) => p !== codeToRemove),
    }));
  };

  // ─── Save All Changes (Boundary + All Zone Properties) ────────────────────
  const handleSaveAll = async () => {
    const finalName = selectedArea?.name || selectedArea?.areaName;
    if (!finalName || !finalName.trim()) {
      toast.error("Please enter a name for the zone");
      return;
    }

    let finalCoords = selectedArea.coordinates || getCoords(selectedArea);
    if (isBoundaryEditing && editPolygonRef.current) {
      const edited = collectEditedCoords();
      if (edited && edited.length >= 4) {
        finalCoords = edited;
      } else {
        toast.error(
          "Invalid boundary polygon shape (requires at least 3 vertices)",
        );
        return;
      }
    }

    try {
      const isExisting = Boolean(selectedArea._id);
      const url = isExisting
        ? `${BASE_URL}/geofence/areas/${selectedArea._id}`
        : `${BASE_URL}/geofence/areas`;
      const method = isExisting ? "PATCH" : "POST";

      const payload = {
        areaName: finalName.trim(),
        name: finalName.trim(),
        city: selectedArea.city || "Indore",
        color: selectedArea.color || "#3b82f6",
        coordinates: finalCoords,
        pincodes: selectedArea.pincodes || [],
        isActive: selectedArea.isActive !== false,
        allowDiscount: selectedArea.allowDiscount !== false,
        multiplier: parseFloat(selectedArea.basePriceMultiplier) || 1.0,
        basePriceMultiplier:
          parseFloat(selectedArea.basePriceMultiplier) || 1.0,
        dynamicSurgeMultiplier:
          parseFloat(selectedArea.dynamicSurgeMultiplier) || 1.0,
        discountPriceMultiplier:
          parseFloat(selectedArea.discountPriceMultiplier) || 1.0,
        heritageMultiplier: parseFloat(selectedArea.heritageMultiplier) || 1.0,
        platformMultiplier: parseFloat(selectedArea.platformMultiplier) || 1.0,
        supplierPlatformMultiplier:
          parseFloat(selectedArea.supplierPlatformMultiplier) || 1.0,
        minPlatformFee: parseFloat(selectedArea.minPlatformFee) || 0,
        maxPlatformFee:
          selectedArea.maxPlatformFee !== "" &&
          selectedArea.maxPlatformFee !== null &&
          selectedArea.maxPlatformFee !== undefined
            ? parseFloat(selectedArea.maxPlatformFee)
            : null,
        minimumOrderValue: parseFloat(selectedArea.minimumOrderValue) || 0,
        freeDeliveryThreshold:
          parseFloat(selectedArea.freeDeliveryThreshold) || 500,
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success(
          isExisting ? "Zone details and boundary updated ✓" : "Zone created ✓",
        );
        setIsBoundaryEditing(false);
        setMode(null);
        setSelectedArea(null);
        fetchAreas();
      } else {
        const err = await res.json();
        toast.error(err.message || "Failed to save zone");
      }
    } catch (_) {
      toast.error("Network error saving zone");
    }
  };

  // ─── Drawing complete: new polygon ─────────────────────────────────────────
  const onPolygonComplete = async (polygon) => {
    const path = polygon.getPath();
    const coordinates = [];
    const googlePath = [];
    for (let i = 0; i < path.getLength(); i++) {
      const pt = path.getAt(i);
      coordinates.push([pt.lng(), pt.lat()]);
      googlePath.push(new window.google.maps.LatLng(pt.lat(), pt.lng()));
    }
    coordinates.push(coordinates[0]);

    // Check overlaps
    const existingPolygons = areas.map((a) => {
      const paths = getCoords(a).map((c) => ({ lat: c[1], lng: c[0] }));
      return new window.google.maps.Polygon({ paths });
    });
    const bounds = new window.google.maps.LatLngBounds();
    googlePath.forEach((pt) => bounds.extend(pt));
    const center = bounds.getCenter();

    const isOverlapping = existingPolygons.some((poly) => {
      const isCenterInside = window.google.maps.geometry.poly.containsLocation(
        center,
        poly,
      );
      const isAnyVertexInside = googlePath.some((v) =>
        window.google.maps.geometry.poly.containsLocation(v, poly),
      );
      return isCenterInside || isAnyVertexInside;
    });

    if (isOverlapping) {
      toast.error("Overlap detected! Cannot draw over an existing zone.", {
        icon: "🚫",
      });
      polygon.setMap(null);
      return;
    }

    // Reverse geocode initial pincodes
    const geocoder = new window.google.maps.Geocoder();
    const pincodes = new Set();
    try {
      for (const pt of [center, ...googlePath.slice(0, 5)]) {
        const resp = await new Promise((resolve) => {
          geocoder.geocode({ location: pt }, (results, status) => {
            if (status === "OK") resolve(results);
            else resolve([]);
          });
        });
        if (resp[0]) {
          const pc = resp[0].address_components?.find((c) =>
            c.types.includes("postal_code"),
          );
          if (pc?.long_name) pincodes.add(pc.long_name);
        }
      }
    } catch (_) {}

    polygon.setMap(null);
    setDrawingMode(null);
    setSearchedLocation(null);

    const color = ZONE_COLORS[areas.length % ZONE_COLORS.length];
    const newZoneData = {
      name: "New Zone",
      city: "Nashik",
      coordinates,
      color,
      dynamicSurgeMultiplier: 1.0,
      basePriceMultiplier: 1.0,
      discountPriceMultiplier: 1.0,
      heritageMultiplier: 1.0,
      platformMultiplier: 1.0,
      supplierPlatformMultiplier: 1.0,
      minPlatformFee: 0,
      maxPlatformFee: null,
      minimumOrderValue: 0,
      freeDeliveryThreshold: 500,
      isActive: true,
      allowDiscount: true,
      pincodes: Array.from(pincodes),
    };

    originalCoordsRef.current = JSON.parse(JSON.stringify(coordinates));
    setSelectedArea(newZoneData);
    setLiveVertexCount(
      coordinates.length > 1 ? coordinates.length - 1 : coordinates.length,
    );
    setIsBoundaryEditing(false);
    setMode("configure");
  };

  // ─── Delete area ───────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!await appDialog.confirm("Delete this service zone? This cannot be undone."))
      return;
    try {
      const res = await fetch(`${BASE_URL}/geofence/areas/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        toast.success("Zone deleted");
        if (selectedArea?._id === id) {
          setSelectedArea(null);
          setMode(null);
          setIsBoundaryEditing(false);
        }
        fetchAreas();
      }
    } catch (_) {
      toast.error("Delete failed");
    }
  };

  // ─── Filtered areas list ───────────────────────────────────────────────────
  const filteredAreas = useMemo(() => {
    if (!search.trim()) return areas;
    const q = search.toLowerCase();
    return areas.filter(
      (a) =>
        a.areaName?.toLowerCase().includes(q) ||
        a.city?.toLowerCase().includes(q) ||
        a.pincodes?.some((p) => p.includes(q)),
    );
  }, [areas, search]);

  const mapOptions = useMemo(
    () => ({
      disableDefaultUI: false,
      clickableIcons: true,
    }),
    [],
  );

  // ─── Sidebar: zone list ────────────────────────────────────────────────────
  const renderZoneListPanel = () => (
    <div className="flex flex-col h-full overflow-hidden bg-white border border-slate-200 rounded-sm shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-widest">
            Service Zones
          </h3>
          <p className="text-[9px] font-bold text-slate-400 mt-0.5">
            {areas.length} areas configured
          </p>
        </div>
        <span className="w-6 h-6 bg-slate-900 text-white text-[9px] font-black rounded-full flex items-center justify-center">
          {areas.length}
        </span>
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-slate-50 shrink-0 space-y-1">
        <FilterLabel label="Search zones" info="Narrows the list to zones whose name, city or pincode contains this text." />
        <div className="relative">
          <Search
            size={12}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search zones..."
            className="w-full pl-8 pr-3 py-2 text-[10px] font-bold bg-slate-50 border border-slate-100 rounded-sm outline-none focus:border-slate-300 transition-all placeholder:text-slate-300"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-900 rounded-full animate-spin" />
          </div>
        ) : filteredAreas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <MapIcon size={24} className="text-slate-200" />
            <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
              No zones found
            </p>
          </div>
        ) : (
          filteredAreas.map((area) => {
            const isActive = area.isActive;
            const isSelected = selectedArea?._id === area._id;
            const coords = getCoords(area);

            return (
              <div
                key={area._id}
                className={`p-4 transition-all cursor-pointer group ${isSelected ? "bg-slate-50" : "hover:bg-slate-50/60"}`}
                onClick={() => panToArea(area)}>
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* Color dot */}
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-black shrink-0 shadow-xs"
                      style={{ backgroundColor: area.color || "#3b82f6" }}>
                      <MapIcon size={14} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight truncate">
                        {area.areaName}
                      </p>
                      <p className="text-[9px] font-bold text-slate-400">
                        {area.city || "Nashik"} · #{area.excelFenceId || "ZN"}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${isActive ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-100 text-slate-400"}`}>
                    {isActive ? "Live" : "Off"}
                  </span>
                </div>

                {/* Pincodes */}
                {area.pincodes?.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {area.pincodes.slice(0, 4).map((p) => (
                      <span
                        key={p}
                        className="px-1.5 py-0.5 bg-white border border-slate-100 rounded text-[8px] font-bold text-slate-500">
                        {p}
                      </span>
                    ))}
                    {area.pincodes.length > 4 && (
                      <span className="px-1.5 py-0.5 bg-slate-50 rounded text-[8px] font-bold text-slate-400">
                        +{area.pincodes.length - 4}
                      </span>
                    )}
                  </div>
                )}

                {/* Quick stats */}
                <div className="mt-2.5 flex items-center gap-3 text-[9px] font-bold text-slate-400">
                  <span className="flex items-center gap-1">
                    <Circle size={7} className="fill-blue-400 text-blue-400" />
                    Base {area.basePriceMultiplier || 1}x
                  </span>
                  <span className="flex items-center gap-1">
                    <Circle
                      size={7}
                      className="fill-amber-400 text-amber-400"
                    />
                    Exp {area.dynamicSurgeMultiplier || 1}x
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin size={8} className="text-slate-300" />
                    {coords.length > 1 ? coords.length - 1 : coords.length} pts
                  </span>
                </div>

                {/* Action buttons — permanently visible and clear */}
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleConfigureArea(area);
                    }}
                    className="flex-1 min-w-[90px] flex items-center justify-center gap-1 px-2.5 py-1.5 bg-slate-900 text-white text-[9px] font-black uppercase tracking-wider rounded-sm hover:bg-black transition-all shadow-xs">
                    <Edit2 size={10} /> Edit Details
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditBoundary(area);
                    }}
                    className="flex-1 min-w-[90px] flex items-center justify-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white text-[9px] font-black uppercase tracking-wider rounded-sm hover:bg-blue-700 transition-all shadow-xs">
                    <Layers size={10} /> Edit Boundary
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(area._id);
                    }}
                    title="Delete Zone"
                    className="p-1.5 bg-rose-50 text-rose-500 rounded-sm hover:bg-rose-100 hover:text-rose-700 transition-all">
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // ─── Sidebar: configure zone properties & boundary ─────────────────────────
  const renderConfigurePanel = () => (
    <div className="flex flex-col h-full overflow-hidden bg-white border border-slate-200 rounded-sm shadow-sm">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-900 text-white">
        <div>
          <h3 className="text-[11px] font-black uppercase tracking-widest">
            {selectedArea?._id ? "Edit Service Zone" : "New Service Zone"}
          </h3>
          <p className="text-[9px] font-bold text-white/60 mt-0.5 truncate max-w-[180px]">
            {selectedArea?.name ||
              selectedArea?.areaName ||
              "Configure boundary & pricing"}
          </p>
        </div>
        <button
          onClick={() => {
            setMode(null);
            setSelectedArea(null);
            setIsBoundaryEditing(false);
          }}
          className="text-white/60 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* ── 1. Boundary Reshaping Controller Card ── */}
        <div
          className={`p-3.5 rounded-sm border transition-all ${isBoundaryEditing ? "bg-blue-50/80 border-blue-200 ring-1 ring-blue-300" : "bg-slate-50 border-slate-200"}`}>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${isBoundaryEditing ? "bg-blue-600 animate-pulse" : "bg-slate-400"}`}
              />
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-800">
                Boundary (
                {liveVertexCount ||
                  (selectedArea?.coordinates || getCoords(selectedArea))
                    .length - 1}{" "}
                Vertices)
              </span>
            </div>
            {originalCoordsRef.current && (
              <button
                type="button"
                onClick={handleResetBoundary}
                title="Revert to original boundary"
                className="text-[8px] font-black text-slate-500 hover:text-slate-800 flex items-center gap-1 uppercase tracking-wider">
                <RotateCcw size={10} /> Reset
              </button>
            )}
          </div>

          <p className="text-[8.5px] font-medium text-slate-500 leading-relaxed mb-3">
            {isBoundaryEditing
              ? "Drag white vertex handles on map to reshape. Drag midpoints to add vertices. Right-click vertex to delete."
              : "Interactive map editing is paused. Click below to drag vertices and reshape boundary on map."}
          </p>

          <button
            type="button"
            onClick={toggleBoundaryEditing}
            className={`w-full py-2 px-3 rounded-sm text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all shadow-xs ${
              isBoundaryEditing
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-white text-slate-800 border border-slate-300 hover:bg-slate-100"
            }`}>
            {isBoundaryEditing ? (
              <>
                <CheckCircle size={11} /> Pin Current Boundary Shape
              </>
            ) : (
              <>
                <Layers size={11} className="text-blue-600" /> Reshape Boundary
                On Map
              </>
            )}
          </button>
        </div>

        {/* ── 2. Zone Name & City ── */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block">
              Zone Name
            </label>
            <input
              value={selectedArea?.name || selectedArea?.areaName || ""}
              onChange={(e) =>
                setSelectedArea({
                  ...selectedArea,
                  name: e.target.value,
                  areaName: e.target.value,
                })
              }
              placeholder="e.g. PALASIYA ZONE"
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-black uppercase tracking-wider focus:border-slate-900 outline-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block">
              City
            </label>
            <input
              value={selectedArea?.city || ""}
              onChange={(e) =>
                setSelectedArea({ ...selectedArea, city: e.target.value })
              }
              placeholder="e.g. Nashik"
              className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-black uppercase tracking-wider focus:border-slate-900 outline-none"
            />
          </div>
        </div>

        {/* ── 3. Map Color ── */}
        <div className="space-y-1">
          <label className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block">
            Zone Map Color
          </label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={selectedArea?.color || "#3b82f6"}
              onChange={(e) =>
                setSelectedArea({ ...selectedArea, color: e.target.value })
              }
              className="w-8 h-8 rounded-sm border border-slate-200 cursor-pointer p-0.5 shrink-0"
            />
            <div className="flex gap-1 flex-wrap">
              {ZONE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setSelectedArea({ ...selectedArea, color: c })}
                  className="w-5 h-5 rounded-full border-2 transition-all"
                  style={{
                    backgroundColor: c,
                    borderColor:
                      selectedArea?.color === c ? "#0f172a" : "transparent",
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── 4. Status & Allow Discount ── */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="space-y-1">
            <label className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest">
              Status (Active)
            </label>
            <div className="flex gap-1">
              {[
                { label: "Active", val: true },
                { label: "Inactive", val: false },
              ].map((opt) => {
                const isActive = (selectedArea?.isActive !== false) === opt.val;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() =>
                      setSelectedArea({ ...selectedArea, isActive: opt.val })
                    }
                    className={`flex-1 py-1.5 rounded-sm text-[8.5px] font-black transition-all border ${
                      isActive
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100"
                    }`}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest">
              Allow Discount
            </label>
            <div className="flex gap-1">
              {[
                { label: "Yes", val: true },
                { label: "No", val: false },
              ].map((opt) => {
                const isActive =
                  (selectedArea?.allowDiscount !== false) === opt.val;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() =>
                      setSelectedArea({
                        ...selectedArea,
                        allowDiscount: opt.val,
                      })
                    }
                    className={`flex-1 py-1.5 rounded-sm text-[8.5px] font-black transition-all border ${
                      isActive
                        ? "bg-slate-900 text-white border-slate-900"
                        : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100"
                    }`}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── 5. Pricing Multipliers ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block">
              Pricing Multipliers
            </label>
            <span className="text-[8px] font-bold text-slate-400">
              Factor (1.0 = standard)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                key: "basePriceMultiplier",
                label: "Base Multiplier",
                color: "text-blue-600",
              },
              {
                key: "dynamicSurgeMultiplier",
                label: "Surge / Express",
                color: "text-amber-600",
              },
              {
                key: "discountPriceMultiplier",
                label: "Discount Multiplier",
                color: "text-emerald-600",
              },
              {
                key: "heritageMultiplier",
                label: "Heritage Multiplier",
                color: "text-purple-600",
              },
              {
                key: "platformMultiplier",
                label: "Service Platform",
                color: "text-sky-600",
              },
              {
                key: "supplierPlatformMultiplier",
                label: "Supplier Platform",
                color: "text-indigo-600",
              },
            ].map(({ key, label, color }) => (
              <div
                key={key}
                className="space-y-0.5 bg-slate-50 p-2 rounded-sm border border-slate-100">
                <label
                  className={`text-[8px] font-black uppercase tracking-wider truncate block ${color}`}>
                  {label}
                </label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  value={
                    selectedArea?.[key] !== undefined &&
                    selectedArea?.[key] !== null
                      ? selectedArea[key]
                      : 1.0
                  }
                  onChange={(e) =>
                    setSelectedArea({
                      ...selectedArea,
                      [key]:
                        e.target.value === "" ? "" : parseFloat(e.target.value),
                    })
                  }
                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded-sm text-[10px] font-black outline-none focus:border-slate-900"
                />
              </div>
            ))}
          </div>
        </div>

        {/* ── 6. Platform Fees & Order Limits ── */}
        <div className="space-y-2">
          <label className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block">
            Platform Fees & Thresholds
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-0.5 bg-slate-50 p-2 rounded-sm border border-slate-100">
              <label className="text-[8px] font-black text-slate-600 uppercase tracking-wider block">
                Min Platform Fee (₹)
              </label>
              <input
                type="number"
                min="0"
                value={
                  selectedArea?.minPlatformFee !== undefined &&
                  selectedArea?.minPlatformFee !== null
                    ? selectedArea.minPlatformFee
                    : 0
                }
                onChange={(e) =>
                  setSelectedArea({
                    ...selectedArea,
                    minPlatformFee:
                      e.target.value === "" ? "" : parseFloat(e.target.value),
                  })
                }
                className="w-full px-2 py-1 bg-white border border-slate-200 rounded-sm text-[10px] font-black outline-none focus:border-slate-900"
              />
            </div>
            <div className="space-y-0.5 bg-slate-50 p-2 rounded-sm border border-slate-100">
              <label className="text-[8px] font-black text-slate-600 uppercase tracking-wider block">
                Max Platform Fee (₹)
              </label>
              <input
                type="number"
                min="0"
                placeholder="None"
                value={
                  selectedArea?.maxPlatformFee !== null &&
                  selectedArea?.maxPlatformFee !== undefined
                    ? selectedArea.maxPlatformFee
                    : ""
                }
                onChange={(e) =>
                  setSelectedArea({
                    ...selectedArea,
                    maxPlatformFee:
                      e.target.value === "" ? null : parseFloat(e.target.value),
                  })
                }
                className="w-full px-2 py-1 bg-white border border-slate-200 rounded-sm text-[10px] font-black outline-none focus:border-slate-900"
              />
            </div>
            <div className="space-y-0.5 bg-slate-50 p-2 rounded-sm border border-slate-100">
              <label className="text-[8px] font-black text-slate-600 uppercase tracking-wider block">
                Min Order Value (₹)
              </label>
              <input
                type="number"
                min="0"
                value={
                  selectedArea?.minimumOrderValue !== undefined &&
                  selectedArea?.minimumOrderValue !== null
                    ? selectedArea.minimumOrderValue
                    : 0
                }
                onChange={(e) =>
                  setSelectedArea({
                    ...selectedArea,
                    minimumOrderValue:
                      e.target.value === "" ? "" : parseFloat(e.target.value),
                  })
                }
                className="w-full px-2 py-1 bg-white border border-slate-200 rounded-sm text-[10px] font-black outline-none focus:border-slate-900"
              />
            </div>
            <div className="space-y-0.5 bg-slate-50 p-2 rounded-sm border border-slate-100">
              <label className="text-[8px] font-black text-slate-600 uppercase tracking-wider block">
                Free Delivery (₹)
              </label>
              <input
                type="number"
                min="0"
                value={
                  selectedArea?.freeDeliveryThreshold !== undefined &&
                  selectedArea?.freeDeliveryThreshold !== null
                    ? selectedArea.freeDeliveryThreshold
                    : 500
                }
                onChange={(e) =>
                  setSelectedArea({
                    ...selectedArea,
                    freeDeliveryThreshold:
                      e.target.value === "" ? "" : parseFloat(e.target.value),
                  })
                }
                className="w-full px-2 py-1 bg-white border border-slate-200 rounded-sm text-[10px] font-black outline-none focus:border-slate-900"
              />
            </div>
          </div>
        </div>

        {/* ── 7. Interactive Serviced Pincodes ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[8.5px] font-black text-slate-400 uppercase tracking-widest block">
              Serviced Pincodes ({selectedArea?.pincodes?.length || 0})
            </label>
            <button
              type="button"
              disabled={detectingPincodes}
              onClick={handleAutoDetectPincodes}
              className="text-[8px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-wider flex items-center gap-1 disabled:opacity-50">
              <RefreshCw
                size={9}
                className={detectingPincodes ? "animate-spin" : ""}
              />
              {detectingPincodes ? "Detecting..." : "Auto-Detect"}
            </button>
          </div>

          <div className="flex gap-1.5">
            <input
              type="text"
              maxLength={6}
              value={newPincodeInput}
              onChange={(e) =>
                setNewPincodeInput(e.target.value.replace(/\D/g, ""))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddPincode();
                }
              }}
              placeholder="Add 6-digit PIN"
              className="flex-1 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-black outline-none focus:border-slate-900"
            />
            <button
              type="button"
              onClick={handleAddPincode}
              className="px-3 py-1.5 bg-slate-900 text-white rounded-sm text-[9px] font-black uppercase tracking-wider hover:bg-black transition-all">
              Add
            </button>
          </div>

          {selectedArea?.pincodes?.length > 0 ? (
            <div className="flex flex-wrap gap-1 p-2 bg-slate-50 rounded-sm border border-slate-100 max-h-28 overflow-y-auto">
              {selectedArea.pincodes.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-bold text-slate-700 shadow-2xs">
                  {p}
                  <button
                    type="button"
                    onClick={() => handleRemovePincode(p)}
                    className="text-slate-400 hover:text-rose-600 transition-colors">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[8px] font-medium text-slate-400 italic">
              No pincodes added yet. Add manually or use Auto-Detect.
            </p>
          )}
        </div>
      </div>

      {/* ── Footer: Save All Changes ── */}
      <div className="px-4 py-3 border-t border-slate-100 shrink-0 bg-slate-50 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setMode(null);
            setSelectedArea(null);
            setIsBoundaryEditing(false);
          }}
          className="flex-1 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-sm font-black text-[9px] uppercase tracking-widest hover:bg-slate-100 transition-all">
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSaveAll}
          className="flex-2 py-2.5 bg-slate-900 text-white rounded-sm font-black text-[10px] uppercase tracking-[0.15em] hover:bg-black transition-all flex items-center justify-center gap-1.5 shadow-sm">
          <Save size={12} /> Save All Changes
        </button>
      </div>
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen bg-slate-50/50 pb-6">
      <PageHeader
        title="Geofence Management"
        actions={[
          {
            label: drawingMode ? "Drawing..." : "Draw New Zone",
            icon: Plus,
            variant: "primary",
            onClick: () => {
              setMode(null);
              setSelectedArea(null);
              setIsBoundaryEditing(false);
              setDrawingMode("polygon");
              setSearchedLocation(null);
            },
          },
        ]}
      />

      <div
        className="flex flex-col lg:flex-row gap-4 lg:gap-5 p-4 lg:p-6 max-w-[1800px] mx-auto w-full"
        style={{ height: "calc(100dvh - 100px)" }}>
        {/* ─── Left sidebar ─────────────────────────────────────── */}
        <div className="w-full lg:w-80 shrink-0 h-[45%] lg:h-full order-2 lg:order-1">
          {mode === "configure"
            ? renderConfigurePanel()
            : renderZoneListPanel()}
        </div>

        {/* ─── Map panel ────────────────────────────────────────── */}
        <div className="w-full lg:flex-1 h-[55%] lg:h-full bg-white rounded-sm border border-slate-200 shadow-sm overflow-hidden relative order-1 lg:order-2">
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={mapContainerStyle}
              center={defaultCenter}
              zoom={13}
              onLoad={(map) => (mapRef.current = map)}
              options={mapOptions}>
              {/* Search box overlay */}
              <Autocomplete
                onLoad={(autocomplete) =>
                  (autocompleteRef.current = autocomplete)
                }
                onPlaceChanged={handlePlaceChanged}>
                <div className="absolute top-4 left-4 z-40 w-72">
                  <div className="relative">
                    <Search
                      size={14}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      placeholder="Search locations..."
                      className="w-full pl-10 pr-4 py-2.5 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-sm text-[10px] font-black uppercase tracking-wider outline-none focus:border-slate-900 focus:bg-white shadow-xl transition-all placeholder:text-slate-400 text-slate-900"
                    />
                  </div>
                </div>
              </Autocomplete>

              {searchedLocation && (
                <>
                  <Marker position={searchedLocation} />
                  {new URLSearchParams(window.location.search).get("name") && (
                    <InfoWindow position={searchedLocation}>
                      <div className="bg-white p-2 rounded-sm max-w-xs shadow-sm">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-800">
                          {decodeURIComponent(
                            new URLSearchParams(window.location.search).get(
                              "name",
                            ),
                          )}
                        </p>
                        <p className="text-[8px] font-bold text-slate-400 mt-0.5">
                          Target Vendor Coordinates
                        </p>
                      </div>
                    </InfoWindow>
                  )}
                </>
              )}

              {/* Drawing manager — only active when drawingMode = 'polygon' */}
              {drawingMode && (
                <DrawingManager
                  onPolygonComplete={onPolygonComplete}
                  drawingMode={
                    window.google?.maps?.drawing?.OverlayType?.POLYGON ||
                    "polygon"
                  }
                  options={{
                    drawingControl: false,
                    polygonOptions: {
                      fillColor: "#3b82f6",
                      fillOpacity: 0.25,
                      strokeWeight: 2.5,
                      strokeColor: "#3b82f6",
                      clickable: false,
                      editable: true,
                      zIndex: 1,
                    },
                  }}
                />
              )}

              {/* Render all existing polygons */}
              {areas.map((area) => {
                const isSelected = selectedArea?._id === area._id;
                const isEditing = isSelected && isBoundaryEditing;

                // Use toGooglePaths to strip duplicated closing vertex for Google Maps Polygon
                const rawCoords =
                  isSelected && selectedArea?.coordinates
                    ? selectedArea.coordinates
                    : getCoords(area);
                const paths = toGooglePaths(rawCoords);

                return (
                  <Polygon
                    key={`${area._id}-${isEditing ? "editing" : "static"}`}
                    paths={paths}
                    editable={isEditing}
                    draggable={false}
                    onLoad={(poly) => {
                      if (isEditing) {
                        editPolygonRef.current = poly;
                        const path = poly.getPath();
                        setLiveVertexCount(path.getLength());

                        const updateCount = () => {
                          if (poly && poly.getPath) {
                            setLiveVertexCount(poly.getPath().getLength());
                          }
                        };

                        const insertListener = path.addListener(
                          "insert_at",
                          updateCount,
                        );
                        const setListener = path.addListener(
                          "set_at",
                          updateCount,
                        );
                        const removeListener = path.addListener(
                          "remove_at",
                          updateCount,
                        );

                        // Allow right-click on any vertex to delete it
                        const rightClickListener = poly.addListener(
                          "rightclick",
                          (e) => {
                            if (e.vertex !== undefined) {
                              const currentPath = poly.getPath();
                              if (currentPath.getLength() > 3) {
                                currentPath.removeAt(e.vertex);
                                setLiveVertexCount(currentPath.getLength());
                                toast("Vertex removed", {
                                  icon: "🗑️",
                                  duration: 1500,
                                });
                              } else {
                                toast.error(
                                  "A polygon must have at least 3 vertices",
                                );
                              }
                            }
                          },
                        );

                        poly._listeners = [
                          insertListener,
                          setListener,
                          removeListener,
                          rightClickListener,
                        ];
                      }
                    }}
                    onUnmount={(poly) => {
                      if (poly && poly._listeners) {
                        poly._listeners.forEach((l) =>
                          window.google?.maps?.event?.removeListener(l),
                        );
                      }
                      if (isEditing && editPolygonRef.current === poly) {
                        editPolygonRef.current = null;
                      }
                    }}
                    options={{
                      fillColor: area.color || "#3b82f6",
                      fillOpacity: isSelected ? 0.35 : 0.15,
                      strokeColor: area.color || "#3b82f6",
                      strokeWeight: isEditing ? 3.5 : isSelected ? 3 : 2,
                      strokeOpacity: 0.9,
                      zIndex: isEditing ? 10 : isSelected ? 5 : 1,
                    }}
                    onClick={() => {
                      if (!isBoundaryEditing) {
                        handleConfigureArea(area);
                      }
                    }}
                  />
                );
              })}

              {/* Render unsaved new zone polygon if in configure mode */}
              {mode === "configure" &&
                selectedArea &&
                !selectedArea._id &&
                selectedArea.coordinates && (
                  <Polygon
                    key={`new-zone-${isBoundaryEditing ? "editing" : "static"}`}
                    paths={toGooglePaths(selectedArea.coordinates)}
                    editable={isBoundaryEditing}
                    draggable={false}
                    onLoad={(poly) => {
                      if (isBoundaryEditing) {
                        editPolygonRef.current = poly;
                        const path = poly.getPath();
                        setLiveVertexCount(path.getLength());
                        const updateCount = () =>
                          setLiveVertexCount(poly.getPath().getLength());
                        path.addListener("insert_at", updateCount);
                        path.addListener("set_at", updateCount);
                        path.addListener("remove_at", updateCount);
                      }
                    }}
                    options={{
                      fillColor: selectedArea.color || "#3b82f6",
                      fillOpacity: 0.35,
                      strokeColor: selectedArea.color || "#3b82f6",
                      strokeWeight: 3.5,
                      strokeOpacity: 0.9,
                      zIndex: 10,
                    }}
                  />
                )}
            </GoogleMap>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50">
              <div className="w-10 h-10 border-4 border-slate-200 border-t-slate-900 rounded-full animate-spin mb-4" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Loading Map...
              </p>
            </div>
          )}

          {/* ── Drawing hint overlay ─────────────────────────── */}
          {drawingMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
              <div className="flex items-center gap-4 bg-white/95 backdrop-blur-sm px-6 py-3.5 rounded-sm shadow-2xl border border-slate-200">
                <div className="w-8 h-8 bg-blue-100 rounded-sm flex items-center justify-center">
                  <Plus size={16} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">
                    Drawing Mode Active
                  </p>
                  <p className="text-[8px] font-bold text-slate-400 mt-0.5">
                    Click on map to place corners · Double-click to finish
                  </p>
                </div>
                <button
                  onClick={() => setDrawingMode(null)}
                  className="pointer-events-auto ml-4 px-3 py-1.5 bg-slate-900 text-white text-[9px] font-black uppercase tracking-widest rounded-sm hover:bg-black transition-all">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Floating Boundary Editing Banner ───────────────────────── */}
          {isBoundaryEditing && selectedArea && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40">
              <div className="flex items-center gap-3 bg-slate-900/95 text-white backdrop-blur-md px-5 py-3 rounded-sm shadow-2xl border border-slate-700">
                <div className="w-8 h-8 bg-blue-600 rounded-sm flex items-center justify-center shrink-0">
                  <Edit2 size={15} className="text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white">
                      Reshaping:{" "}
                      {selectedArea.name || selectedArea.areaName || "Zone"}
                    </p>
                    <span className="px-1.5 py-0.2 bg-blue-500/30 text-blue-300 rounded text-[8px] font-bold">
                      {liveVertexCount} vertices
                    </span>
                  </div>
                  <p className="text-[8px] font-medium text-slate-300 mt-0.5">
                    Drag points to reshape · Drag midpoints to add · Right-click
                    point to delete
                  </p>
                </div>
                <button
                  onClick={toggleBoundaryEditing}
                  className="ml-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[9px] font-black uppercase tracking-widest rounded-sm transition-all shadow-xs shrink-0">
                  Done Reshaping
                </button>
              </div>
            </div>
          )}

          {/* ── Empty state (no zones yet) ────────────────────── */}
          {!drawingMode && mode === null && areas.length === 0 && !loading && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40">
              <div className="bg-slate-900/90 backdrop-blur-xl px-8 py-5 rounded-sm border border-white/10 text-white shadow-2xl flex items-center gap-4 max-w-md">
                <div className="w-10 h-10 bg-white/10 rounded-sm flex items-center justify-center shrink-0">
                  <Info size={20} className="text-blue-400" />
                </div>
                <div>
                  <h4 className="text-[11px] font-black uppercase tracking-tight mb-1">
                    No Zones Yet
                  </h4>
                  <p className="text-[9px] font-medium text-white/60 leading-relaxed uppercase tracking-widest">
                    Click "Draw New Zone" to define your first service boundary.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
