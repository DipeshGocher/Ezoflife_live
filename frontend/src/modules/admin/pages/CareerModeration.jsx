import { matchesFilter } from '../utils/filters';
import MultiSelectFilter from '../components/common/MultiSelectFilter';
import { appDialog } from '../../../shared/stores/appDialogStore';
import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { jobApi, adminApi, UPLOADS_URL } from "../../../lib/api";
import toast from "react-hot-toast";
import * as XLSX from "xlsx";
import {
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Download,
  FileText,
  Briefcase,
  Eye,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertCircle,
  Sparkles,
  User,
  RefreshCw,
} from "lucide-react";
import PageHeader from "../components/common/PageHeader";
import DataGrid from "../components/tables/DataGrid";
import FilterField from "../components/common/FilterLabel";

const CareerModeration = ({ creatorFilter = "Admin" }) => {
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [viewingApp, setViewingApp] = useState(null);
  const [editingNotesApplication, setEditingNotesApplication] = useState(null);
  const [tempNotes, setTempNotes] = useState("");
  const [selectedJobIdForApps, setSelectedJobIdForApps] = useState(null);

  // Form & View controllers
  const [viewMode, setViewMode] = useState("Jobs"); // 'Jobs' or 'Applications'
  const [jobFilterStatus, setJobFilterStatus] = useState("");
  const [appFilterStatus, setAppFilterStatus] = useState("");
  const [jobFilterRole, setJobFilterRole] = useState("");
  const [appFilterRole, setAppFilterRole] = useState("");

  // Admin configuration profiles
  // Loaded from the database (SystemConfig 'company_profile', set in Admin Settings)
  const [adminAddresses, setAdminAddresses] = useState([]);
  const [adminCompany, setAdminCompany] = useState("");
  const [defaultJobLocation, setDefaultJobLocation] = useState("");

  // Admin direct posting form
  const [form, setForm] = useState({
    title: "",
    companyName: "",
    description: "",
    requirements: "",
    experience: "1-2 Years",
    location: "",
    type: "Full-time",
    salary: "As per Industry",
    skills: ["Punctual"],
  });
  const [newSkill, setNewSkill] = useState("");
  const [templates, setTemplates] = useState([]);

  useEffect(() => {
    fetchJobs();
    fetchApplications();
    fetchTemplates();
    loadAdminConfigs();
  }, [creatorFilter]);

  const fetchTemplates = async () => {
    try {
      const data = await jobApi.getRoleTemplates();
      // Filter templates where targetRole is Admin
      const adminTemplates = (Array.isArray(data) ? data : []).filter(
        (t) => t.targetRole === "Admin",
      );
      setTemplates(adminTemplates);
    } catch (error) {
      console.error("Fetch templates error:", error);
    }
  };

  // City part of an address, e.g. "Indore" from "12 MG Road, Indore, MP"
  const cityFromAddress = (addr) => {
    const parts = String(addr || "").split(",").map((p) => p.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 2] : parts[0] || "";
  };

  const loadAdminConfigs = async () => {
    try {
      const configs = await adminApi.getConfig();
      const company =
        (Array.isArray(configs) ? configs : []).find((c) => c.key === "company_profile")?.value || {};
      const addresses = Array.isArray(company.addresses) ? company.addresses : [];
      const primary = addresses.find((a) => a.isDefault) || addresses[0];
      const location = primary ? cityFromAddress(primary.address) : "";

      setAdminAddresses(addresses);
      setAdminCompany(company.companyName || "");
      setDefaultJobLocation(location);
      setForm((prev) => ({
        ...prev,
        companyName: prev.companyName || company.companyName || "",
        location: prev.location || location,
      }));
    } catch (error) {
      console.error("Failed to load company profile:", error);
    }
  };

  const fetchJobs = async () => {
    try {
      setLoading(true);
      const data = await jobApi.getAdminAll();
      // Filter based on creator role (Admin, Vendor, Supplier or All)
      const filteredJobs = (Array.isArray(data) ? data : []).filter((job) => {
        if (!creatorFilter || creatorFilter === "All") return true;
        const role = (job.creatorRole || "Vendor").trim().toLowerCase();
        const target = creatorFilter.trim().toLowerCase();
        return role === target;
      });
      setJobs(filteredJobs);
    } catch (error) {
      console.error("Fetch all jobs error:", error);
      toast.error("Failed to sync job posts.");
    } finally {
      setLoading(false);
    }
  };

  const fetchApplications = async () => {
    try {
      const data = await jobApi.getAdminApplications(creatorFilter);
      setApplications(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Fetch applications error:", error);
      toast.error("Failed to sync candidate applications.");
    }
  };

  // Actions
  const handleAdminCreate = async (e) => {
    e.preventDefault();
    try {
      const adminRaw =
        localStorage.getItem("adminData") ||
        localStorage.getItem("user") ||
        localStorage.getItem("userData") ||
        "{}";
      const adminData = JSON.parse(adminRaw);

      const requirementsArray = form.requirements
        .split(",")
        .map((r) => r.trim())
        .filter((r) => r !== "");
      const jobData = {
        ...form,
        requirements: requirementsArray,
        createdBy:
          adminData._id ||
          adminData.id ||
          adminData.user?._id ||
          adminData.user?.id ||
          "admin_id",
        creatorRole: "Admin",
        status: "Open",
      };
      await jobApi.adminCreate(jobData);
      await fetchJobs();
      setIsCreating(false);
      toast.success("Corporate Job Posted Successfully");
      setForm({
        title: "",
        companyName: adminCompany,
        description: "",
        requirements: "",
        experience: "1-2 Years",
        location: defaultJobLocation,
        type: "Full-time",
        salary: "As per Industry",
        skills: ["Punctual"],
      });
    } catch (error) {
      toast.error("Creation failed");
    }
  };

  const handleEdit = (job) => {
    setEditingJob(job);
    setForm({
      title: job.title,
      companyName: job.companyName || adminCompany,
      description: job.description,
      requirements: Array.isArray(job.requirements)
        ? job.requirements.join(", ")
        : job.requirements || "",
      experience: job.experience || "1-2 Years",
      location: job.location || defaultJobLocation,
      type: job.type || "Full-time",
      salary: job.salary || "As per Industry",
      skills: job.skills || [],
    });
    setIsEditing(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      const requirementsArray =
        typeof form.requirements === "string"
          ? form.requirements
              .split(",")
              .map((r) => r.trim())
              .filter((r) => r !== "")
          : form.requirements;
      const updateData = {
        ...form,
        requirements: requirementsArray,
      };
      await jobApi.update(editingJob._id, updateData);
      await fetchJobs();
      setIsEditing(false);
      setEditingJob(null);
      toast.success("Job details updated successfully");
    } catch (error) {
      toast.error("Update failed");
    }
  };

  const handleUpdateJobStatus = async (id, status) => {
    try {
      await jobApi.updateStatus(id, status);
      await fetchJobs();
      toast.success(`Job marked as ${status.toUpperCase()}`);
    } catch (error) {
      toast.error("Status update failed");
    }
  };

  const handleUpdateApplicationStatus = async (id, status) => {
    try {
      await jobApi.updateApplicationStatus(id, status);
      await fetchApplications();
      toast.success(`Application marked as ${status}`);
    } catch (error) {
      toast.error("Application status update failed");
    }
  };

  const handleDeleteJob = async (id) => {
    if (
      await appDialog.confirm(
        "Are you sure you want to permanently delete this job posting? This action will also delete all candidate applications linked to it.",
      )
    ) {
      try {
        await jobApi.delete(id);
        await fetchJobs();
        await fetchApplications();
        toast.success("Job posting deleted successfully");
      } catch (err) {
        toast.error("Failed to delete job post");
      }
    }
  };

  const handleDeleteApplication = async (id) => {
    if (await appDialog.confirm("Are you sure you want to delete this application record?")) {
      try {
        await jobApi.deleteApplication(id);
        await fetchApplications();
        toast.success("Application record deleted");
      } catch (err) {
        toast.error("Deletion failed");
      }
    }
  };

  // Filter list arrays
  const uniqueJobRoles = useMemo(() => {
    const roles = jobs.map((j) => j.title).filter(Boolean);
    return [...new Set(roles)];
  }, [jobs]);

  const uniqueAppRoles = useMemo(() => {
    const roles = applications
      .map((a) => a.job?.title || a.jobId?.title)
      .filter(Boolean);
    return [...new Set(roles)];
  }, [applications]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      const matchesStatus = !jobFilterStatus || job.status === jobFilterStatus;
      const matchesRole = matchesFilter(jobFilterRole, job.title);
      return matchesStatus && matchesRole;
    });
  }, [jobs, jobFilterStatus, jobFilterRole]);

  const filteredApps = useMemo(() => {
    return applications.filter((app) => {
      const matchesJob =
        !selectedJobIdForApps ||
        app.job?._id === selectedJobIdForApps ||
        app.jobId?._id === selectedJobIdForApps ||
        app.job === selectedJobIdForApps ||
        app.jobId === selectedJobIdForApps;
      const matchesStatus = matchesFilter(appFilterStatus, app.status);
      const matchesRole =
        matchesFilter(appFilterRole, app.job?.title) || matchesFilter(appFilterRole, app.jobId?.title);
      return matchesJob && matchesStatus && matchesRole;
    });
  }, [applications, appFilterStatus, appFilterRole, selectedJobIdForApps]);

  // XLSX Downloads
  const handleDownloadJobs = () => {
    const headers = [
      "S.No",
      "Job ID",
      "Title",
      "Company Name",
      "Location",
      "Salary",
      "Type",
      "Status",
      "Applicants Count",
      "Posted Date",
    ];
    const rows = filteredJobs.map((j, i) => [
      i + 1,
      j._id,
      j.title,
      j.companyName || j.vendor?.displayName || "Vendor Post",
      j.location,
      j.salary,
      j.jobType || j.type || "N/A",
      j.status,
      j.applicantsCount || 0,
      new Date(j.createdAt).toLocaleDateString(),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Jobs");
    XLSX.writeFile(
      wb,
      `${creatorFilter}_Job_Postings_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  const handleDownloadApps = () => {
    const headers = [
      "S.No",
      "Application ID",
      "Candidate Name",
      "Email",
      "Contact",
      "Job Title",
      "Experience",
      "Status",
      "Applied Date",
    ];
    const rows = filteredApps.map((a, i) => [
      i + 1,
      a._id,
      a.applicantName,
      a.applicantEmail,
      a.contactNumber || a.applicantPhone || "N/A",
      a.job?.title || a.jobId?.title || "N/A",
      a.experience || "Not specified",
      a.status,
      new Date(a.createdAt).toLocaleDateString(),
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Applications");
    XLSX.writeFile(
      wb,
      `${creatorFilter}_Job_Applications_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  // DataGrid Column Configurations
  const jobColumns = [
    {
      header: "S.No",
      key: "sNo",
      width: "60px",
      render: (val, row) => jobs.indexOf(row) + 1,
    },
    {
      header: "ID",
      key: "jobCode",
      render: (val, row) => (
        <span className="font-bold text-indigo-600 font-mono text-[10px] bg-indigo-50/50 px-1.5 py-0.5 rounded">
          {row.jobCode || `JOB-${row._id.slice(-4).toUpperCase()}`}
        </span>
      ),
    },
    {
      header: "Title",
      key: "title",
      render: (val, row) => (
        <div className="flex flex-col">
          <span className="font-bold text-slate-900 text-xs tracking-tight">
            {row.title}
          </span>
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">
            {row.jobType || row.type || "Full-time"}
          </span>
        </div>
      ),
    },
    {
      header: "Company Name",
      key: "companyName",
      render: (val, row) =>
        row.companyName || row.vendor?.displayName || "Vendor Partner",
    },
    { header: "Location", key: "location" },
    { header: "Salary", key: "salary" },
    {
      header: "Actions",
      key: "_id",
      align: "right",
      render: (id, row) => (
        <div
          className="flex justify-end items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => {
              setSelectedJobIdForApps(id);
              setViewMode("Applications");
            }}
            className="p-1 hover:bg-slate-100 text-slate-500 hover:text-slate-900 rounded"
            title="View Candidates/Applications">
            <Eye size={13} />
          </button>
          {creatorFilter === "Admin" ? (
            <>
              <button
                onClick={() => handleEdit(row)}
                className="p-1 hover:bg-slate-100 text-blue-600 rounded"
                title="Edit Post">
                <Edit2 size={13} />
              </button>
            </>
          ) : (
            <select
              value={row.status || "Open"}
              onChange={(e) => handleUpdateJobStatus(id, e.target.value)}
              className="bg-white border border-slate-200 rounded p-1 text-[9px] font-black uppercase tracking-wider text-slate-600 cursor-pointer">
              <option value="Open">Open</option>
              <option value="Paused">Paused</option>
              <option value="Closed">Closed</option>
            </select>
          )}
        </div>
      ),
    },
  ];

  const appColumns = [
    {
      header: "S.No",
      key: "sNo",
      width: "60px",
      render: (val, row) => applications.indexOf(row) + 1,
    },
    {
      header: "Candidate",
      key: "applicantName",
      render: (val, row) => (
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500 overflow-hidden shrink-0 shadow-inner">
            {row.applicant?.profileImage ? (
              <img
                src={row.applicant.profileImage}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <User size={13} />
            )}
          </div>
          <span className="font-bold text-slate-900 text-xs tracking-tight">
            {row.applicantName}
          </span>
        </div>
      ),
    },
    {
      header: "Applied For",
      key: "job",
      render: (val, row) => (
        <span className="font-bold text-slate-800">
          {row.job?.title || row.jobId?.title || "Unknown Position"}
        </span>
      ),
    },
    { header: "Email", key: "applicantEmail" },
    {
      header: "Contact",
      key: "contactNumber",
      render: (val, row) => row.contactNumber || row.applicantPhone || "N/A",
    },
    {
      header: "Experience",
      key: "experience",
      render: (val) => val || "Not specified",
    },
    {
      header: "Status",
      key: "status",
      render: (val) => {
        const s = val || "Submitted";
        let style = "bg-slate-50 text-slate-600 border border-slate-100";

        switch (s) {
          case "Submitted":
            style = "bg-amber-50 text-amber-600 border border-amber-100";
            break;
          case "Shortlisted":
            style = "bg-indigo-50 text-indigo-600 border border-indigo-100";
            break;
          case "Interview Scheduled":
            style = "bg-violet-50 text-violet-600 border border-violet-100";
            break;
          case "Post-Interview Review":
            style = "bg-sky-50 text-sky-600 border border-sky-100";
            break;
          case "Background Check":
            style = "bg-cyan-50 text-cyan-600 border border-cyan-100";
            break;
          case "Offer Generation":
            style = "bg-fuchsia-50 text-fuchsia-600 border border-fuchsia-100";
            break;
          case "Offer Extended":
            style = "bg-emerald-50 text-emerald-600 border border-emerald-100";
            break;
          case "Pre-onboarding":
            style = "bg-teal-50 text-teal-600 border border-teal-100";
            break;
          case "Rejected":
            style = "bg-rose-50 text-rose-600 border border-rose-100";
            break;
          case "Candidate Withdrew":
            style = "bg-orange-50 text-orange-600 border border-orange-100";
            break;
        }

        return (
          <span
            className={`px-2.5 py-1 rounded-sm text-[9px] font-black uppercase tracking-wider ${style}`}>
            {s}
          </span>
        );
      },
    },
    ...(creatorFilter === "Admin"
      ? [
          {
            header: "Notes",
            key: "notes",
            render: (val, row) => {
              const count = row.notesHistory?.length || 0;
              return (
                <button
                  onClick={() => {
                    setEditingNotesApplication(row);
                    setTempNotes("");
                  }}
                  className={`px-3 py-1.5 rounded-sm text-[9px] font-black tracking-wider uppercase border text-left truncate max-w-[150px] transition-all cursor-pointer block ${
                    count > 0
                      ? "bg-primary/5 text-primary border-primary/20 hover:bg-primary/10"
                      : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-600"
                  }`}
                  title={val || "Add Notes"}>
                  {count > 0 ? `Notes (${count})` : "Add Notes"}
                </button>
              );
            },
          },
        ]
      : []),
    {
      header: "Actions",
      key: "_id",
      align: "right",
      render: (id, row) => (
        <div
          className="flex justify-end items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setViewingApp(row)}
            className="p-1 hover:bg-slate-100 text-slate-500 rounded"
            title="View Application">
            <Eye size={13} />
          </button>
          {creatorFilter === "Admin" && (
            <select
              value={row.status || "Submitted"}
              onChange={(e) =>
                handleUpdateApplicationStatus(id, e.target.value)
              }
              className="bg-white border border-slate-200 rounded p-1 text-[9px] font-black uppercase tracking-wider text-slate-600 cursor-pointer">
              <option value="Submitted">Submitted</option>
              <option value="Shortlisted">Shortlisted</option>
              <option value="Interview Scheduled">Interview Scheduled</option>
              <option value="Post-Interview Review">
                Post-Interview Review
              </option>
              <option value="Background Check">Background Check</option>
              <option value="Offer Generation">Offer Generation</option>
              <option value="Offer Extended">Offer Extended</option>
              <option value="Pre-onboarding">Pre-onboarding</option>
              <option value="Rejected">Rejected</option>
              <option value="Candidate Withdrew">Candidate Withdrew</option>
            </select>
          )}
          <button
            onClick={() => handleDeleteApplication(id)}
            className="p-1 hover:bg-slate-100 text-slate-400 hover:text-slate-900 rounded"
            title="Delete record">
            <Trash2 size={13} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="admin-theme flex flex-col min-h-screen bg-slate-50/50 pb-20">
      {/* Header Strip */}
      {/* Office cities saved in Admin Settings (database), offered as job locations */}
      <datalist id="company-office-locations">
        {Array.from(new Set(adminAddresses.map((a) => cityFromAddress(a.address)).filter(Boolean))).map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <PageHeader
        title={`${creatorFilter} Posts`}
        actions={
          creatorFilter === "Admin"
            ? [
                {
                  label: "Create Direct Post",
                  icon: Plus,
                  onClick: () => setIsCreating(true),
                  variant: "primary",
                },
              ]
            : []
        }
      />

      {/* Main Content Area */}
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto w-full">
        {/* Switch Tabs */}
        <FilterField label="Show" info="Jobs lists the career posts. Applications lists the candidates who applied to them. The numbers are how many match the current filters.">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div className="bg-slate-100/80 p-1 rounded-xl flex items-center shadow-sm w-fit border border-slate-200/50">
            <button
              onClick={() => setViewMode("Jobs")}
              className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                viewMode === "Jobs"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-400 hover:text-slate-700"
              }`}>
              Jobs ({filteredJobs.length})
            </button>
            <button
              onClick={() => setViewMode("Applications")}
              className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                viewMode === "Applications"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-400 hover:text-slate-700"
              }`}>
              Applications ({filteredApps.length})
            </button>
          </div>

          <button
            onClick={() => {
              fetchJobs();
              fetchApplications();
              toast.success("Sync complete");
            }}
            className="p-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-sm text-slate-400 hover:text-slate-950 flex items-center justify-center transition-colors"
            title="Sync Records">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        </FilterField>

        {/* Render Table views */}
        {viewMode === "Jobs" ? (
          <DataGrid
            title={`${creatorFilter} Openings`}
            columns={jobColumns}
            data={filteredJobs}
            loading={loading}
            showFilter={false}
            showSearch={false}
            onDownload={handleDownloadJobs}
            actions={
              <div className="flex items-end gap-2">
                {/* Role Filter */}
                <FilterField label="Role" info="Shows only job posts for this role (e.g. Ironing Specialist).">
                <MultiSelectFilter
                  value={jobFilterRole}
                  onChange={(e) => setJobFilterRole(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer">
                  <option value="">All Roles</option>
                  {uniqueJobRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </MultiSelectFilter>
                </FilterField>
              </div>
            }
          />
        ) : (
          <DataGrid
            title={`${creatorFilter} Applicant Requests`}
            columns={appColumns}
            data={filteredApps}
            loading={loading}
            showFilter={false}
            showSearch={false}
            onDownload={handleDownloadApps}
            actions={
              <div className="flex items-end gap-2">
                {selectedJobIdForApps && (
                  <div className="flex items-center gap-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-1 rounded-sm text-[9px] font-black uppercase tracking-wider">
                    <span>
                      Filtered Job ID:{" "}
                      {jobs.find((j) => j._id === selectedJobIdForApps)
                        ?.jobCode ||
                        `JOB-${selectedJobIdForApps.slice(-4).toUpperCase()}`}
                    </span>
                    <button
                      onClick={() => setSelectedJobIdForApps(null)}
                      className="hover:text-indigo-900 transition-colors flex items-center justify-center shrink-0"
                      title="Clear Job Filter">
                      <X size={10} />
                    </button>
                  </div>
                )}
                {/* Job Title Filter */}
                <FilterField label="Position" info="Shows only applications made for this job position.">
                <MultiSelectFilter
                  value={appFilterRole}
                  onChange={(e) => setAppFilterRole(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer">
                  <option value="">All Positions</option>
                  {uniqueAppRoles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </MultiSelectFilter>
                </FilterField>

                {/* Candidate Status Filter */}
                <FilterField label="Candidate status" info="Shows only applicants at this hiring stage, from Submitted through Offer Extended, or Rejected / Withdrew.">
                <MultiSelectFilter
                  value={appFilterStatus}
                  onChange={(e) => setAppFilterStatus(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-sm text-[10px] font-bold text-slate-900 focus:bg-white focus:border-slate-900 transition-all outline-none w-36 uppercase tracking-wider cursor-pointer">
                  <option value="">All Status</option>
                  <option value="Submitted">Submitted</option>
                  <option value="Shortlisted">Shortlisted</option>
                  <option value="Interview Scheduled">
                    Interview Scheduled
                  </option>
                  <option value="Post-Interview Review">
                    Post-Interview Review
                  </option>
                  <option value="Background Check">Background Check</option>
                  <option value="Offer Generation">Offer Generation</option>
                  <option value="Offer Extended">Offer Extended</option>
                  <option value="Pre-onboarding">Pre-onboarding</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Candidate Withdrew">Candidate Withdrew</option>
                </MultiSelectFilter>
                </FilterField>
              </div>
            }
          />
        )}
      </div>

      {/* Direct Admin Post Creation Modal */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-20">
            <div
              onClick={() => setIsCreating(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] p-8 relative z-10 shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar">
              <h2 className="text-xl font-bold text-slate-900 tracking-tighter uppercase mb-6 flex items-center gap-2">
                <Sparkles className="text-amber-500" size={18} />
                Create Corporate Career Post
              </h2>
              <form onSubmit={handleAdminCreate} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                    Role Template (Auto-Fill Description)
                  </label>
                  <select
                    onChange={(e) => {
                      const selectedTpl = templates.find(
                        (t) => t._id === e.target.value,
                      );
                      if (selectedTpl) {
                        setForm((prev) => ({
                          ...prev,
                          title: selectedTpl.name,
                          description: selectedTpl.description,
                        }));
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold focus:bg-white outline-none cursor-pointer"
                    defaultValue="">
                    <option value="" disabled>
                      Select Description Template...
                    </option>
                    {templates.map((tpl) => (
                      <option key={tpl._id} value={tpl._id}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                      Title
                    </label>
                    <input
                      required
                      value={form.title}
                      onChange={(e) =>
                        setForm({ ...form, title: e.target.value })
                      }
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-semibold focus:bg-white outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                      Company Name
                    </label>
                    <input
                      required
                      value={form.companyName}
                      onChange={(e) =>
                        setForm({ ...form, companyName: e.target.value })
                      }
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-semibold focus:bg-white outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                    Description
                  </label>
                  <textarea
                    required
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-semibold min-h-[90px] focus:bg-white outline-none resize-none"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                      Required Experience
                    </label>
                    <input
                      required
                      placeholder="e.g. 1-2 Years"
                      value={form.experience}
                      onChange={(e) =>
                        setForm({ ...form, experience: e.target.value })
                      }
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-semibold focus:bg-white outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                      Job Type
                    </label>
                    <select
                      value={form.type}
                      onChange={(e) =>
                        setForm({ ...form, type: e.target.value })
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-slate-900/5 cursor-pointer">
                      <option>Full-time</option>
                      <option>Part-time</option>
                      <option>Contract</option>
                      <option>Internship</option>
                      <option>Freelance</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                    Salary Range (Monthly)
                  </label>
                  <select
                    required
                    value={form.salary}
                    onChange={(e) =>
                      setForm({ ...form, salary: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold outline-none cursor-pointer">
                    <option value="" disabled>
                      Select Salary Bracket
                    </option>
                    <option value="10000-20000">₹10,000 - ₹20,000</option>
                    <option value="20000-30000">₹20,000 - ₹30,000</option>
                    <option value="30000-40000">₹30,000 - ₹40,000</option>
                    <option value="50000+">₹50,000+</option>
                    <option value="As per Industry">As per Industry</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                    Location
                  </label>
                  <input
                    required
                    list="company-office-locations"
                    placeholder="City of the job"
                    value={form.location}
                    onChange={(e) =>
                      setForm({ ...form, location: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-semibold focus:bg-white outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                    Skills & Qualifications
                  </label>
                  <div className="flex flex-wrap gap-1.5 px-1.5">
                    {form.skills.map((skill) => (
                      <span
                        key={skill}
                        className="px-2.5 py-1 bg-slate-900 text-white rounded text-[8px] font-black uppercase flex items-center gap-1.5">
                        {skill}
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              ...form,
                              skills: form.skills.filter((s) => s !== skill),
                            })
                          }>
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      placeholder="Add skill..."
                      className="flex-1 bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-semibold"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          newSkill.trim() &&
                          !form.skills.includes(newSkill.trim())
                        ) {
                          setForm({
                            ...form,
                            skills: [...form.skills, newSkill.trim()],
                          });
                          setNewSkill("");
                        }
                      }}
                      className="px-5 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-black">
                      ADD
                    </button>
                  </div>
                </div>
                <div className="flex gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="flex-1 py-4 bg-slate-100 text-slate-400 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] py-4 bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-xl shadow-slate-900/10 hover:bg-black transition-all">
                    Save
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Direct Admin Post Editing Modal */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-20">
            <div
              onClick={() => {
                setIsEditing(false);
                setEditingJob(null);
              }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white w-full max-w-2xl rounded-[2.5rem] p-8 relative z-10 shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar">
              <h2 className="text-xl font-bold text-slate-900 tracking-tighter uppercase mb-6 flex items-center gap-2">
                <Edit2 className="text-indigo-500" size={16} />
                Edit Corporate Job Post
              </h2>
              <form onSubmit={handleUpdate} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                    Role Template (Auto-Fill Description)
                  </label>
                  <select
                    onChange={(e) => {
                      const selectedTpl = templates.find(
                        (t) => t._id === e.target.value,
                      );
                      if (selectedTpl) {
                        setForm((prev) => ({
                          ...prev,
                          title: selectedTpl.name,
                          description: selectedTpl.description,
                        }));
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold focus:bg-white outline-none cursor-pointer"
                    defaultValue="">
                    <option value="" disabled>
                      Select Description Template...
                    </option>
                    {templates.map((tpl) => (
                      <option key={tpl._id} value={tpl._id}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                      Title
                    </label>
                    <input
                      required
                      value={form.title}
                      onChange={(e) =>
                        setForm({ ...form, title: e.target.value })
                      }
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-semibold focus:bg-white outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                      Company Name
                    </label>
                    <input
                      required
                      value={form.companyName}
                      onChange={(e) =>
                        setForm({ ...form, companyName: e.target.value })
                      }
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-semibold focus:bg-white outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                    Description
                  </label>
                  <textarea
                    required
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-semibold min-h-[90px] focus:bg-white outline-none resize-none"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                      Required Experience
                    </label>
                    <input
                      required
                      value={form.experience}
                      onChange={(e) =>
                        setForm({ ...form, experience: e.target.value })
                      }
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-semibold focus:bg-white outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                      Job Type
                    </label>
                    <select
                      value={form.type}
                      onChange={(e) =>
                        setForm({ ...form, type: e.target.value })
                      }
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold outline-none cursor-pointer">
                      <option>Full-time</option>
                      <option>Part-time</option>
                      <option>Contract</option>
                      <option>Internship</option>
                      <option>Freelance</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                    Salary Range (Monthly)
                  </label>
                  <select
                    required
                    value={form.salary}
                    onChange={(e) =>
                      setForm({ ...form, salary: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-semibold outline-none cursor-pointer">
                    <option value="" disabled>
                      Select Salary Bracket
                    </option>
                    <option value="10000-20000">₹10,000 - ₹20,000</option>
                    <option value="20000-30000">₹20,000 - ₹30,000</option>
                    <option value="30000-40000">₹30,000 - ₹40,000</option>
                    <option value="50000+">₹50,000+</option>
                    <option value="As per Industry">As per Industry</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 ml-3 uppercase">
                    Location
                  </label>
                  <input
                    required
                    list="company-office-locations"
                    placeholder="City of the job"
                    value={form.location}
                    onChange={(e) =>
                      setForm({ ...form, location: e.target.value })
                    }
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-semibold focus:bg-white outline-none focus:ring-2 focus:ring-slate-900/5 transition-all"
                  />
                </div>
                <div className="flex gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditingJob(null);
                    }}
                    className="flex-1 py-4 bg-slate-100 text-slate-400 rounded-xl font-bold text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors">
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] py-4 bg-slate-900 text-white rounded-xl font-bold text-[10px] uppercase tracking-widest shadow-xl hover:bg-black transition-all">
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Candidate Application View Detail Modal */}
      <AnimatePresence>
        {viewingApp && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-lg rounded-[2.5rem] p-8 shadow-2xl relative overflow-hidden">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-500 overflow-hidden shadow-inner">
                    {viewingApp.applicant?.profileImage ? (
                      <img
                        src={viewingApp.applicant.profileImage}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User size={22} />
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 tracking-tight leading-none mb-1">
                      {viewingApp.applicantName}
                    </h3>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Candidate Application
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setViewingApp(null)}
                  className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200">
                  <X size={15} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Email
                    </p>
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {viewingApp.applicantEmail}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                      Contact
                    </p>
                    <p className="text-xs font-semibold text-slate-800">
                      {viewingApp.contactNumber ||
                        viewingApp.applicantPhone ||
                        "N/A"}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      Role Details
                    </p>
                    <span className="px-2.5 py-0.5 bg-indigo-50 border border-indigo-100 rounded-md text-[8px] font-black text-indigo-600 uppercase tracking-widest">
                      {viewingApp.experience || "Fresher"} Exp
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-800 leading-normal">
                    Applying For:{" "}
                    <span className="text-indigo-500">
                      {viewingApp.job?.title ||
                        viewingApp.jobId?.title ||
                        "Job Posting"}
                    </span>
                  </p>
                  {viewingApp.coverLetter && (
                    <div className="pt-2 border-t border-slate-200/50 mt-2">
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                        Cover Note
                      </p>
                      <p className="text-xs font-medium text-slate-500 leading-relaxed italic">
                        "{viewingApp.coverLetter}"
                      </p>
                    </div>
                  )}
                </div>

                {viewingApp.resumeLink && (
                  <a
                    href={
                      viewingApp.resumeLink.startsWith("http")
                        ? viewingApp.resumeLink
                        : `${UPLOADS_URL}/uploads/${viewingApp.resumeLink.replace(/^\/?uploads\/?/, "")}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-4 bg-slate-900 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-black transition-all shadow-lg shadow-slate-900/10">
                    <FileText size={14} />
                    View Attached Resume
                    <ExternalLink size={12} />
                  </a>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Application Notes Drawer */}
      <AnimatePresence>
        {editingNotesApplication && (
          <div className="fixed inset-0 z-[120] flex justify-end">
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingNotesApplication(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            />

            {/* Drawer Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="bg-white w-full max-w-lg h-full relative z-10 shadow-2xl flex flex-col text-slate-900 border-l border-slate-100">
              {/* Header */}
              <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 shrink-0">
                <h2 className="font-bold text-slate-800 tracking-tight uppercase text-sm">
                  Application Notes
                </h2>
                <button
                  onClick={() => setEditingNotesApplication(null)}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-100 transition-colors">
                  <X size={16} />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
                {/* Application Details Section */}
                <div>
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Application Details
                  </h3>
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-xs uppercase shadow-inner">
                        {editingNotesApplication.applicantName
                          ? editingNotesApplication.applicantName
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .substring(0, 2)
                          : "A"}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-xs tracking-tight">
                          {editingNotesApplication.applicantName}
                        </h4>
                        <p className="text-[10px] text-slate-500">
                          {editingNotesApplication.applicantEmail}
                        </p>
                        <p className="text-[10px] font-medium text-slate-700 mt-1">
                          Applied for:{" "}
                          <span className="font-bold text-slate-800 uppercase">
                            {editingNotesApplication.job?.title ||
                              editingNotesApplication.jobId?.title ||
                              "Position"}
                          </span>
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-md text-[8px] font-black text-indigo-600 uppercase tracking-widest">
                      {editingNotesApplication.status || "Submitted"}
                    </span>
                  </div>
                </div>

                {/* Add Note Section */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Add Note
                  </h3>
                  <div className="space-y-3">
                    <textarea
                      value={tempNotes}
                      onChange={(e) => {
                        if (e.target.value.length <= 500) {
                          setTempNotes(e.target.value);
                        }
                      }}
                      placeholder="Write your note here..."
                      rows={4}
                      className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-medium focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none resize-none transition-all"
                    />
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-slate-300">
                        {tempNotes.length}/500
                      </span>
                      <button
                        onClick={async () => {
                          if (!tempNotes.trim()) {
                            toast.error(
                              "Please write something before adding.",
                            );
                            return;
                          }
                          try {
                            const res = await jobApi.updateApplicationNotes(
                              editingNotesApplication._id,
                              tempNotes,
                            );
                            toast.success("Note added successfully");
                            setTempNotes("");
                            setEditingNotesApplication(res);
                            fetchApplications();
                          } catch (error) {
                            toast.error("Failed to add note");
                          }
                        }}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/10 flex items-center gap-2 cursor-pointer">
                        Add Note
                        <svg
                          className="w-3.5 h-3.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13"></line>
                          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Note History Section */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Note History (
                    {(editingNotesApplication.notesHistory || []).length})
                  </h3>

                  {editingNotesApplication.notesHistory &&
                  editingNotesApplication.notesHistory.length > 0 ? (
                    <div className="space-y-3">
                      {editingNotesApplication.notesHistory.map(
                        (historyItem, idx) => {
                          const initials = historyItem.authorName
                            ? historyItem.authorName
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .substring(0, 2)
                            : "A";

                          const colorClasses = [
                            "bg-indigo-50 border-indigo-100 text-indigo-700",
                            "bg-emerald-50 border-emerald-100 text-emerald-700",
                            "bg-amber-50 border-amber-100 text-amber-700",
                            "bg-purple-50 border-purple-100 text-purple-700",
                          ][idx % 4];

                          return (
                            <div
                              key={idx}
                              className={`p-4 rounded-2xl border flex gap-3 ${colorClasses}`}>
                              <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs uppercase shadow-inner shrink-0 bg-white border`}>
                                {initials}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-center mb-1">
                                  <h4 className="font-bold text-slate-900 text-xs truncate">
                                    {historyItem.authorName}
                                  </h4>
                                  <span className="text-[9px] text-slate-400 font-medium">
                                    {new Date(
                                      historyItem.createdAt,
                                    ).toLocaleDateString("en-IN", {
                                      day: "2-digit",
                                      month: "short",
                                      year: "numeric",
                                    })}
                                    ,{" "}
                                    {new Date(
                                      historyItem.createdAt,
                                    ).toLocaleTimeString("en-US", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: true,
                                    })}
                                  </span>
                                </div>
                                <p className="text-xs font-semibold text-slate-600 leading-normal">
                                  {historyItem.text}
                                </p>
                              </div>
                            </div>
                          );
                        },
                      )}
                    </div>
                  ) : (
                    <div className="py-8 flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-2xl text-slate-400">
                      <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-3 shadow-inner">
                        <svg
                          className="w-6 h-6"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                      </div>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 text-center">
                        All notes are displayed here
                      </p>
                      <p className="text-[9px] text-slate-400/60 mt-1 text-center max-w-[240px]">
                        Add notes to keep track of important updates.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CareerModeration;
