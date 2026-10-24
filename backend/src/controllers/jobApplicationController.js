import JobApplication from '../models/JobApplication.js';
import Notification from '../models/Notification.js';
import Job from '../models/Job.js';
import User from '../models/User.js';
import { getEventPublisher } from '../socket.js';
import { sendJobApplicationConfirmation, sendAdminJobApplicationNotification } from '../utils/emailHelper.js';
import { httpStatusForError } from '../utils/errorResponse.js';

export const submitApplication = async (req, res) => {
    try {
        const applicationData = { ...req.body };
        
        if (req.file) {
            applicationData.resumeLink = `/uploads/${req.file.filename}`;
        }
        
        const application = new JobApplication(applicationData);
        await application.save();
        
        // --- Create Notifications ---
        const job = await Job.findById(application.jobId);
        if (job) {
            const io = getEventPublisher();
            
            // 1. Notify Job Creator (Vendor, Supplier or Admin)
            const creatorNotification = await Notification.create({
                recipient: job.createdBy,
                role: job.creatorRole === 'Admin' ? 'admin' : (job.creatorRole === 'Supplier' ? 'supplier' : 'vendor'),
                title: 'New Job Application',
                message: `You have a new application from ${application.applicantName} for the position of ${job.title}.`,
                type: 'job_application',
                payload: { applicationId: application._id, jobId: job._id }
            });
            
            // Emit Socket for Creator
            try {
                io.emit('new_notification', {
                    recipient: job.createdBy.toString(),
                    role: job.creatorRole === 'Admin' ? 'admin' : (job.creatorRole === 'Supplier' ? 'supplier' : 'vendor'),
                    notification: creatorNotification
                });
            } catch (err) { console.error('Socket Emit Error (Creator):', err); }
            
            // 2. Notify Global Admin (if creator was Vendor or Supplier)
            if (job.creatorRole === 'Vendor' || job.creatorRole === 'Supplier') {
                const admin = await User.findOne({ 
                    $or: [
                        { role: 'Admin' },
                        { phone: 'ADMIN_SYSTEM' }
                    ]
                });
                if (admin && admin._id.toString() !== job.createdBy.toString()) {
                    const adminNotification = await Notification.create({
                        recipient: admin._id,
                        role: 'admin',
                        title: 'New Job Application (System-wide)',
                        message: `Candidate ${application.applicantName} applied for ${job.title} at ${job.companyName}.`,
                        type: 'job_application',
                        payload: { applicationId: application._id, jobId: job._id }
                    });
                    
                    // Emit Socket for Admin
                    try {
                        io.emit('new_notification', {
                            recipient: admin._id.toString(),
                            role: 'admin',
                            notification: adminNotification
                        });
                    } catch (err) { console.error('Socket Emit Error (Admin):', err); }
                }
            }
        }

        // Trigger email notifications asynchronously (non-blocking)
        try {
            if (application.applicantEmail) {
                sendJobApplicationConfirmation(application, job ? job.title : 'Job Position').catch(err => {
                    console.error('Error sending application confirmation to applicant:', err);
                });
            }
            if (job) {
                const jobWithVendor = await Job.findById(job._id).populate('vendor');
                const adminUser = await User.findOne({ role: 'Admin' });
                const adminEmail = adminUser?.email || process.env.ADMIN_EMAIL || 'admin@ezoflife.com';

                let recipientEmail = adminEmail;
                let ccEmail = undefined;

                if (jobWithVendor && (jobWithVendor.creatorRole === 'Vendor' || jobWithVendor.creatorRole === 'Supplier')) {
                    const creatorEmail = jobWithVendor.vendor?.email;
                    if (creatorEmail) {
                        recipientEmail = creatorEmail;
                        ccEmail = adminEmail;
                    }
                }

                sendAdminJobApplicationNotification(application, job.title, recipientEmail, ccEmail).catch(err => {
                    console.error('Error sending job application notification email:', err);
                });
            }
        } catch (emailErr) {
            console.error('Error triggering job application emails:', emailErr);
        }
        
        res.status(201).json(application);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

export const getApplicationsForJob = async (req, res) => {
    try {
        const { jobId } = req.params;
        const applications = await JobApplication.find({ jobId }).sort({ createdAt: -1 });
        res.json(applications);
    } catch (error) {
        res.status(httpStatusForError(error)).json({ message: error.message });
    }
};

export const getAllApplications = async (req, res) => {
    try {
        const applications = await JobApplication.find()
            .populate('jobId', 'title companyName')
            .sort({ createdAt: -1 });
        res.json(applications);
    } catch (error) {
        res.status(httpStatusForError(error)).json({ message: error.message });
    }
};

export const getVendorApplications = async (req, res) => {
    try {
        const { vendorId } = req.params;
        // Find all jobs created by this vendor
        const jobs = await Job.find({ createdBy: vendorId }).select('_id');
        const jobIds = jobs.map(j => j._id);
        
        // Find applications for these jobs
        const applications = await JobApplication.find({ jobId: { $in: jobIds } })
            .populate('jobId', 'title companyName')
            .sort({ createdAt: -1 });
        res.json(applications);
    } catch (error) {
        res.status(httpStatusForError(error)).json({ message: error.message });
    }
};

export const updateApplicationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const application = await JobApplication.findByIdAndUpdate(id, { status }, { new: true });
        res.json(application);
    } catch (error) {
        res.status(httpStatusForError(error)).json({ message: error.message });
    }
};

export const deleteApplication = async (req, res) => {
    try {
        await JobApplication.findByIdAndDelete(req.params.id);
        res.json({ message: 'Application deleted successfully' });
    } catch (error) {
        res.status(httpStatusForError(error)).json({ message: error.message });
    }
};
