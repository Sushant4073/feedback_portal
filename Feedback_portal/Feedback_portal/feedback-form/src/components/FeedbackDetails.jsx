import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  TextField,
  Typography,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Card,
  CardContent,
  IconButton,
  Stack,
  Alert,
  CircularProgress,
  Divider,
  Container,
  Fade,
  Avatar,
  Tooltip,
  Chip,
  LinearProgress,
} from "@mui/material";
import ThumbUpIcon from "@mui/icons-material/ThumbUp";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SendIcon from "@mui/icons-material/Send";
import PersonIcon from "@mui/icons-material/Person";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import AttachmentIcon from "@mui/icons-material/Attachment";
import DownloadIcon from "@mui/icons-material/Download";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import AddIcon from "@mui/icons-material/Add";
import { getFeedback, getComments, createComment, deleteComment, postVote, createFeedback, updateFeedback, uploadAttachment, listAttachments, getAttachmentDownloadURL, deleteAttachment, getPresignedUploadURL, uploadFileDirectly, confirmAttachmentUpload, finalizeFeedback } from "../services/api";

const CATEGORY_CONFIG = {
  DEFECT: {
    label: "Defect",
    color: "#f44336",
    bgcolor: "rgba(244, 67, 54, 0.12)",
  },
  FEATURE: {
    label: "Feature",
    color: "#9c27b0",
    bgcolor: "rgba(156, 39, 176, 0.12)",
  },
  ENHANCEMENT: {
    label: "Improvement",
    color: "#009688",
    bgcolor: "rgba(0, 150, 136, 0.12)",
  },
  OTHER: {
    label: "Other",
    color: "#607d8b",
    bgcolor: "rgba(96, 125, 139, 0.12)",
  },
};

const STATUS_CONFIG = {
  OPEN: {
    label: "Open",
    color: "#4caf50",
    bgcolor: "rgba(76, 175, 80, 0.12)",
  },
  IN_PROGRESS: {
    label: "In Progress",
    color: "#ff9800",
    bgcolor: "rgba(255, 152, 0, 0.12)",
  },
  RESOLVED: {
    label: "Resolved",
    color: "#2196f3",
    bgcolor: "rgba(33, 150, 243, 0.12)",
  },
  CLOSED: {
    label: "Closed",
    color: "#757575",
    bgcolor: "rgba(117, 117, 117, 0.12)",
  },
};

const STATUS_OPTIONS = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

const formatDate = (dateStr) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatRelativeTime = (dateStr) => {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
};

const FeedbackDetails = ({ mode = "view" }) => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [voteLoading, setVoteLoading] = useState(false);

  console.log("FeedbackDetails render - mode:", mode, "id:", id, "loading:", loading, "error:", error, "selectedFeedback:", selectedFeedback);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    status: "OPEN",
  });
  const [commentInput, setCommentInput] = useState("");
  const [hasVoted, setHasVoted] = useState(false);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [attachments, setAttachments] = useState([]);
  // Store pending files for upload after feedback creation
  const [pendingFiles, setPendingFiles] = useState([]);
  const [similarFeedbacks, setSimilarFeedbacks] = useState([]);
  const [pendingFeedbackResult, setPendingFeedbackResult] = useState(null);

  const isNewFeedback = mode === "create";
  const tenantId = "default-tenant";
  const userId = "default-user";

  const fetchFeedbackData = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log("Fetching feedback with id:", id);
      const data = await getFeedback(id);
      console.log("Feedback response:", data);

      if (!data) {
        throw new Error("No data received from API");
      }

      setSelectedFeedback(data);

      setFormData({
        title: data.title || "",
        description: data.description || "",
        category: data.category || "DEFECT",
        status: data.status || "OPEN",
      });

      // Try to fetch comments
      try {
        const commentsData = await getComments(id);
        setComments(commentsData || []);
      } catch (commentErr) {
        console.warn("Failed to load comments:", commentErr);
        setComments([]);
      }

      // Try to fetch attachments
      try {
        const attachmentsData = await listAttachments(id);
        setAttachments(attachmentsData || []);
      } catch (attachErr) {
        console.warn("Failed to load attachments:", attachErr);
        setAttachments([]);
      }
    } catch (err) {
      console.error("Error fetching feedback:", err);
      setError(err.message || "Failed to load feedback");
    } finally {
      setLoading(false);
    }
  };

  // Wrap fetchFeedbackData in useCallback to avoid dependency issues
  const stableFetchFeedbackData = useCallback(fetchFeedbackData, [id]);

  useEffect(() => {
    console.log("FeedbackDetails useEffect - isNewFeedback:", isNewFeedback, "id:", id);
    if (!isNewFeedback && id) {
        stableFetchFeedbackData();
    }
  }, [isNewFeedback, id, stableFetchFeedbackData]);

  const handleBack = () => {
    navigate("/");
  };

  const handleUpdateFeedback = async () => {
    if (!id) {
      await handleCreateFeedback();
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const updateData = {
        category: formData.category,
        status: formData.status,
        tenant_id: "default-tenant",
        user_id: "default-user",
      };

      await updateFeedback(id, updateData);

      setSubmitting(false);
      alert("Feedback updated successfully!");
      setTimeout(() => {
        window.location.href = "/";
      }, 100);
    } catch (err) {
      console.error("Error updating feedback:", err);
      setError(err.message || "Failed to update feedback");
      alert("Update failed: " + err.message);
      setSubmitting(false);
    }
  };

  // Uploads pending files and finalizes the feedback (triggers Jira ticket creation).
  const uploadAndFinalize = async (result) => {
    const feedbackId = result.id;

    if (pendingFiles.length > 0) {
      let uploadErrors = [];
      for (let i = 0; i < pendingFiles.length; i++) {
        const pendingFile = pendingFiles[i];
        try {
          const { upload_url, s3_key, file_name } = await getPresignedUploadURL(
            feedbackId,
            tenantId,
            pendingFile.name
          );
          await uploadFileDirectly(upload_url, pendingFile);
          await confirmAttachmentUpload(feedbackId, s3_key, file_name);
        } catch (uploadErr) {
          console.error(`Failed to upload ${pendingFile.name}:`, uploadErr);
          uploadErrors.push(pendingFile.name);
        }
      }
      if (uploadErrors.length > 0) {
        console.warn(`Some files failed to upload: ${uploadErrors.join(', ')}`);
      }
    }

    await finalizeFeedback(feedbackId);
    setSubmitting(false);
    alert("Feedback created successfully! Jira ticket will be created with all attachments.");
    setTimeout(() => {
      window.location.href = "/";
    }, 100);
  };

  const handleContinueAnyway = async () => {
    setSubmitting(true);
    setSimilarFeedbacks([]);
    try {
      await uploadAndFinalize(pendingFeedbackResult);
      setPendingFeedbackResult(null);
    } catch (err) {
      console.error("Error finalizing feedback:", err);
      setError(err.message || "Failed to finalize feedback");
      setSubmitting(false);
    }
  };

  const handleCancelAfterSimilar = () => {
    setSimilarFeedbacks([]);
    setPendingFeedbackResult(null);
    navigate("/");
  };

  const handleCreateFeedback = async () => {
    setSubmitting(true);
    setError(null);

    try {
      // Step 1: Create the feedback (no event sent yet)
      const result = await createFeedback({
        title: formData.title,
        description: formData.description,
        tenant_id: "default-tenant",
        user_id: "default-user",
      });

      // Step 2: Check if the LLM detected similar/duplicate feedback.
      // If so, pause and let the user decide before finalizing.
      if (result.similar_feedback && result.similar_feedback.length > 0) {
        setSimilarFeedbacks(result.similar_feedback);
        setPendingFeedbackResult(result);
        setSubmitting(false);
        return;
      }
      }

      // Step 3: Upload files + finalize (triggers Jira ticket creation).
      await uploadAndFinalize(result);
    } catch (err) {
      console.error("Error creating feedback:", err);
      setError(err.message || "Failed to create feedback");
      setSubmitting(false);
    }
  };

  const handlePostComment = async () => {
    if (!commentInput.trim()) return;

    const newCommentText = commentInput;
    setCommentInput("");

    // Optimistic update - add comment to UI immediately
    const optimisticComment = {
      id: Date.now(), // temporary ID
      content: newCommentText,
      user_id: "default-user",
      created_at: new Date().toISOString(),
    };
    setComments(prev => [...prev, optimisticComment]);

    try {
      const userId = "default-user";
      await createComment(id, userId, newCommentText);
      alert("Comment added successfully!");
      // Fetch the real comments to get the server-generated IDs
      const commentsData = await getComments(id);
      setComments(commentsData || []);
    } catch (err) {
      console.error("Error posting comment:", err);
      // Remove optimistic comment on error
      setComments(prev => prev.filter(c => c.id !== optimisticComment.id));
      setError(err.message || "Failed to post comment");
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      const userId = "default-user";
      await deleteComment(commentId, userId);
      // Just remove the deleted comment from local state instead of refetching
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      alert("Comment deleted successfully!");
    } catch (err) {
      console.error("Error deleting comment:", err);
      setError(err.message || "Failed to delete comment");
      alert("Failed to delete comment: " + err.message);
    }
  };

  const handleVote = async () => {
    if (voteLoading || !selectedFeedback) return;

    setVoteLoading(true);
    const currentVoted = hasVoted;
    const currentVotes = selectedFeedback.vote_count || 0;

    // Optimistic update - update UI immediately
    setHasVoted(!currentVoted);
    setSelectedFeedback(prev => ({
      ...prev,
      vote_count: currentVoted ? currentVotes - 1 : currentVotes + 1
    }));

    try {
      const userId = "default-user";
      const result = await postVote(id, userId);

      if (result.message === "voted") {
        // Confirm the optimistic update was correct
        if (currentVoted) {
          // Server says we voted, but we thought we hadn't - revert
          setHasVoted(false);
          setSelectedFeedback(prev => ({
            ...prev,
            vote_count: prev.vote_count
          }));
        }
        // Sync with localStorage for FeedbackList
        const savedVotes = localStorage.getItem("votedFeedbacks");
        const votedSet = savedVotes ? new Set(JSON.parse(savedVotes)) : new Set();
        votedSet.add(id);
        localStorage.setItem("votedFeedbacks", JSON.stringify([...votedSet]));
      } else {
        // Server says we unvoted - confirm the optimistic update
        setHasVoted(false);
        setSelectedFeedback(prev => ({
          ...prev,
          vote_count: prev.vote_count
        }));
        // Sync with localStorage for FeedbackList
        const savedVotes = localStorage.getItem("votedFeedbacks");
        const votedSet = savedVotes ? new Set(JSON.parse(savedVotes)) : new Set();
        votedSet.delete(id);
        localStorage.setItem("votedFeedbacks", JSON.stringify([...votedSet]));
      }
    } catch (err) {
      console.error("Error voting:", err);
      // Revert optimistic update on error
      setHasVoted(currentVoted);
      setSelectedFeedback(prev => ({
        ...prev,
        vote_count: currentVotes
      }));
      setError(err.message || "Failed to vote");
    } finally {
      setVoteLoading(false);
    }
  };

  const handleFieldChange = (field) => (e) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleFileUpload = async (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    // Validate file size (max 100MB for presigned URL flow)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (selectedFile.size > maxSize) {
      setError("File size exceeds 100MB limit");
      return;
    }

    setFile(selectedFile);
  };

  const handleAddFile = () => {
    // In create mode, add file to pending list without uploading yet
    if (file) {
      setPendingFiles([...pendingFiles, file]);
      setFile(null);
      // Clear the file input
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        fileInput.value = '';
      }
    }
  };

  const handleRemovePendingFile = (index) => {
    setPendingFiles(pendingFiles.filter((_, i) => i !== index));
  };

  const handleUploadFile = async () => {
    if (!file || !id || uploadingFile) return;

    setUploadingFile(true);
    setUploadProgress(0);
    setError(null);

    try {
      // Step 1: Get presigned URL for upload
      const { upload_url, s3_key, file_name } = await getPresignedUploadURL(id, tenantId, file.name);

      // Step 2: Upload directly to S3 using presigned URL (with real progress tracking)
      await uploadFileDirectly(upload_url, file, (progress) => {
        setUploadProgress(progress);
      });

      setUploadProgress(100);

      // Step 3: Confirm upload and create database record
      await confirmAttachmentUpload(id, s3_key, file_name);

      setUploadingFile(false);
      setFile(null);

      // Refresh attachments list
      try {
        const attachmentsData = await listAttachments(id);
        setAttachments(attachmentsData || []);
      } catch (err) {
        console.warn("Failed to refresh attachments:", err);
      }

      // Show success message
      alert("File uploaded successfully!");

      // Clear the file input
      const fileInput = document.querySelector('input[type="file"]');
      if (fileInput) {
        fileInput.value = '';
      }

      // Reset progress after a delay
      setTimeout(() => setUploadProgress(0), 2000);
    } catch (err) {
      console.error("Error uploading file:", err);
      setError(err.message || "Failed to upload file");
      setUploadingFile(false);
      setUploadProgress(0);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    // Clear the file input
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      fileInput.value = '';
    }
  };

  return (
    <Box
      sx={{
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)",
      }}
    >
      <Container maxWidth="lg" sx={{ height: "100%", display: "flex", flexDirection: "column", py: 2, px: 2 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}

            {/* Similar / Duplicate Feedback Warning */}
            {similarFeedbacks.length > 0 && (
              <Alert
                severity="warning"
                sx={{ mb: 2, borderRadius: 2 }}
                icon={false}
              >
                <Typography variant="subtitle2" fontWeight="700" mb={0.5}>
                  Similar Feedback Already Exists
                </Typography>
                <Typography variant="body2" mb={1.5}>
                  AI detected that your feedback may be similar to the following existing items. You can view them or continue creating your new feedback anyway.
                </Typography>
                <Stack spacing={1} mb={2}>
                  {similarFeedbacks.map((item) => (
                    <Button
                      key={item.id}
                      variant="outlined"
                      size="small"
                      color="warning"
                      onClick={() => navigate(`/feedback/${item.id}`)}
                      sx={{ justifyContent: "flex-start", textAlign: "left", borderRadius: 2, textTransform: "none" }}
                    >
                      {item.title}
                    </Button>
                  ))}
                </Stack>
                <Stack direction="row" spacing={2}>
                  <Button
                    variant="contained"
                    color="warning"
                    size="small"
                    onClick={handleContinueAnyway}
                    disabled={submitting}
                    sx={{ borderRadius: 2, fontWeight: 600 }}
                  >
                    {submitting ? "Submitting..." : "Continue Anyway"}
                  </Button>
                  <Button
                    variant="outlined"
                    color="warning"
                    size="small"
                    onClick={handleCancelAfterSimilar}
                    sx={{ borderRadius: 2 }}
                  >
                    Go Back
                  </Button>
                </Stack>
              </Alert>
            )}

            {/* Header Card */}
          <Card
            elevation={0}
            sx={{
              mb: 2,
              borderRadius: 2,
              background: "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)",
              color: "white",
              flexShrink: 0,
            }}
          >
            <CardContent sx={{ py: 2, px: 3 }}>
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                spacing={2}
              >
                <Button onClick={handleBack} sx={{ color: "white", fontWeight: 600 }} startIcon={<ArrowBackIcon />}>
                  Back
                </Button>
                <Typography variant="h5" fontWeight="700" sx={{ fontSize: "1.4rem" }}>
                  {isNewFeedback ? "Create" : "Feedback Details"}
                </Typography>

                {!isNewFeedback && (
                  <Button
                    variant="contained"
                    onClick={handleUpdateFeedback}
                    disabled={submitting || loading}
                    startIcon={submitting ? <CircularProgress size={20} /> : <EditIcon />}
                    sx={{
                      bgcolor: "white",
                      color: "#1976d2",
                      fontWeight: 600,
                      borderRadius: 2,
                    }}
                  >
                    {submitting ? "Saving..." : "Update"}
                  </Button>
                )}
              </Stack>
            </CardContent>
          </Card>

          {/* Content Area - Scrollable */}
          <Box
            sx={{
              flex: 1,
              overflow: "auto",
              minHeight: 0,
            }}
          >
            {/* Main Content Card */}
            <Card
              elevation={1}
              sx={{ borderRadius: 2, mb: 2 }}
            >
              <CardContent sx={{ p: 3 }}>
              {/* Status and Category Display (View Mode Only) */}
              {!isNewFeedback && selectedFeedback && (
                <Box mb={3}>
                  <Stack direction="row" spacing={1.5} flexWrap="wrap">
                    <Chip
                      label={STATUS_CONFIG[formData.status]?.label || formData.status}
                      sx={{
                        borderRadius: 2,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        px: 1.5,
                        py: 0.5,
                        bgcolor: STATUS_CONFIG[formData.status]?.bgcolor || "rgba(117, 117, 117, 0.12)",
                        color: STATUS_CONFIG[formData.status]?.color || "#757575",
                      }}
                    />
                    <Chip
                      label={CATEGORY_CONFIG[formData.category]?.label || formData.category}
                      sx={{
                        borderRadius: 2,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        px: 1.5,
                        py: 0.5,
                        bgcolor: CATEGORY_CONFIG[formData.category]?.bgcolor || "rgba(96, 125, 139, 0.12)",
                        color: CATEGORY_CONFIG[formData.category]?.color || "#607d8b",
                      }}
                    />
                  </Stack>
                </Box>
              )}

              {/* Form Fields */}
              <Stack spacing={3.5}>
                {/* Title */}
                {isNewFeedback ? (
                  <Box>
                    <Typography variant="subtitle1" fontWeight="600" mb={1} sx={{ color: "#37474f", fontSize: "0.875rem" }}>
                      Title
                    </Typography>
                    <TextField
                      fullWidth
                      value={formData.title}
                      onChange={handleFieldChange("title")}
                      variant="outlined"
                      placeholder="Enter a title for your feedback..."
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    />
                  </Box>
                ) : (
                  <Box>
                    <Typography variant="subtitle1" fontWeight="600" mb={1} sx={{ color: "#37474f", fontSize: "0.875rem" }}>
                      Title
                    </Typography>
                    <Box sx={{ p: 2, bgcolor: "#f5f5f5", borderRadius: 2 }}>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                        {formData.title}
                      </Typography>
                    </Box>
                  </Box>
                )}

                {/* Description */}
                {isNewFeedback ? (
                  <Box>
                    <Typography variant="subtitle1" fontWeight="600" mb={1} sx={{ color: "#37474f", fontSize: "0.875rem" }}>
                      Description
                    </Typography>
                    <TextField
                      fullWidth
                      multiline
                      rows={3}
                      value={formData.description}
                      onChange={handleFieldChange("description")}
                      variant="outlined"
                      placeholder="Describe your feedback in detail..."
                      sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                    />
                  </Box>
                ) : (
                  <Box>
                    <Typography variant="subtitle1" fontWeight="600" mb={1} sx={{ color: "#37474f", fontSize: "0.875rem" }}>
                      Description
                    </Typography>
                    <Box sx={{ p: 2, bgcolor: "#f5f5f5", borderRadius: 2, whiteSpace: "pre-wrap", maxHeight: "200px", overflow: "auto" }}>
                      <Typography variant="body2">
                        {formData.description}
                      </Typography>
                    </Box>
                  </Box>
                )}

                {/* Category */}
                <Box>
                  <Typography variant="subtitle1" fontWeight="600" mb={1} sx={{ color: "#37474f", fontSize: "0.875rem" }}>
                    Category
                  </Typography>
                  {isNewFeedback ? (
                    <Box sx={{ p: 2, bgcolor: "#f5f5f5", borderRadius: 2 }}>
                      <Typography variant="body2" color="text.secondary">
                        Category will be assigned automatically by AI after you submit this feedback.
                      </Typography>
                    </Box>
                  ) : (
                    <Box sx={{ p: 2, bgcolor: "#f5f5f5", borderRadius: 2 }}>
                      <Chip
                        label={formData.category || "Not set"}
                        sx={{
                          ...CATEGORY_CONFIG[formData.category] || { color: "#9e9e9e", label: formData.category || "Not set", bgcolor: "rgba(158,158, 158, 0.12)" },
                          bgcolor: CATEGORY_CONFIG[formData.category]?.bgcolor || "rgba(158, 158, 158, 0.12)",
                          color: CATEGORY_CONFIG[formData.category]?.color || "#616161",
                        }}
                      />
                    </Box>
                  )}
                </Box>

                {/* Status */}
                {!isNewFeedback && (
                  <Box>
                  <Typography variant="subtitle1" fontWeight="600" mb={1} sx={{ color: "#37474f", fontSize: "0.875rem" }}>
                    Status
                  </Typography>
                  <FormControl fullWidth>
                    <InputLabel sx={{ bgcolor: "white", px: 1, borderRadius: 1 }}>Status</InputLabel>
                    <Select
                      value={formData.status}
                      label="Status"
                      onChange={handleFieldChange("status")}
                      sx={{ borderRadius: 2 }}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <MenuItem key={status} value={status}>
                          {status.replace(/_/g, " ")}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
                )}

                {/* Files */}
                <Box>
                  <Typography variant="subtitle1" fontWeight="600" mb={1} sx={{ color: "#37474f", fontSize: "0.875rem" }}>
                    Attachments
                  </Typography>

                  <Box
                    sx={{
                      border: "2px dashed #cfd8dc",
                      borderRadius: 3,
                      p: 3,
                      textAlign: "center",
                      bgcolor: "#fafbfc",
                    }}
                  >
                    <Stack spacing={2}>
                      {/* Display existing attachments (view mode only) */}
                      {!isNewFeedback && attachments.length > 0 && (
                        <Stack spacing={1}>
                          {attachments.map((attachment) => (
                            <Card
                              key={attachment.id}
                              variant="outlined"
                              sx={{
                                px: 2,
                                py: 1.5,
                                display: "flex",
                                alignItems: "center",
                                gap: 2,
                                borderRadius: 2,
                                bgcolor: "white",
                              }}
                            >
                              <AttachmentIcon color="primary" />
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" fontWeight="500" noWrap>
                                  {attachment.file_name}
                                </Typography>
                              </Box>
                              <Stack direction="row" spacing={1}>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<DownloadIcon />}
                                  onClick={async () => {
                                    try {
                                      const downloadUrl = await getAttachmentDownloadURL(attachment.id);
                                      console.log("Download URL received:", downloadUrl);
                                      if (downloadUrl && downloadUrl.startsWith && (downloadUrl.startsWith('http://') || downloadUrl.startsWith('https://'))) {
                                        window.open(downloadUrl, "_blank");
                                      } else {
                                        console.error("Invalid download URL:", downloadUrl);
                                        alert("Invalid download URL returned. Please try again.");
                                      }
                                    } catch (err) {
                                      console.error("Failed to get download URL:", err);
                                      alert("Failed to download file. Please try again. Error: " + (err.message || "Unknown"));
                                    }
                                  }}
                                  sx={{ borderRadius: 2 }}
                                >
                                  Download
                                </Button>
                                <Tooltip title="Delete attachment">
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={async () => {
                                      if (window.confirm(`Delete "${attachment.file_name}"?`)) {
                                        try {
                                          await deleteAttachment(id, attachment.id);
                                          // Refresh attachments list
                                          const attachmentsData = await listAttachments(id);
                                          setAttachments(attachmentsData || []);
                                        } catch (err) {
                                          console.error("Failed to delete attachment:", err);
                                          alert("Failed to delete attachment. Please try again.");
                                        }
                                      }
                                    }}
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </Stack>
                            </Card>
                          ))}
                        </Stack>
                      )}

                      {uploadingFile && (
                        <Box>
                          <Typography variant="caption" color="text.secondary" gutterBottom>
                            Uploading file...
                          </Typography>
                          <LinearProgress variant="determinate" value={uploadProgress} />
                        </Box>
                      )}

                      {/* Display pending files in create mode (files selected but not yet uploaded) */}
                      {isNewFeedback && pendingFiles.length > 0 && (
                        <Stack spacing={1}>
                          <Typography variant="caption" color="text.secondary">
                            {pendingFiles.length} file(s) ready to upload
                          </Typography>
                          {pendingFiles.map((pendingFile, index) => (
                            <Card
                              key={index}
                              variant="outlined"
                              sx={{
                                px: 2,
                                py: 1.5,
                                display: "flex",
                                alignItems: "center",
                                gap: 2,
                                borderRadius: 2,
                                bgcolor: "white",
                              }}
                            >
                              <AttachmentIcon color="primary" />
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" fontWeight="500" noWrap>
                                  {pendingFile.name}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {(pendingFile.size / 1024).toFixed(0)} KB
                                </Typography>
                              </Box>
                              <Tooltip title="Remove file">
                                <IconButton
                                  size="small"
                                  onClick={() => handleRemovePendingFile(index)}
                                  sx={{ color: "#f44336" }}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </Card>
                          ))}
                        </Stack>
                      )}

                      {file && (
                        <Card
                          variant="outlined"
                          sx={{
                            px: 2,
                            py: 1.5,
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                            borderRadius: 2,
                            bgcolor: "white",
                          }}
                        >
                          <AttachmentIcon color="action" />
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" fontWeight="500" noWrap>
                              {file.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {(file.size / 1024).toFixed(0)} KB
                            </Typography>
                          </Box>
                          {!uploadingFile && (
                            <>
                              {isNewFeedback ? (
                                // In create mode, show "Add" button instead of "Upload"
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={handleAddFile}
                                  startIcon={<AddIcon />}
                                  sx={{ borderRadius: 2 }}
                                >
                                  Add
                                </Button>
                              ) : (
                                // In view mode, show "Upload" button
                                <Button
                                  size="small"
                                  variant="contained"
                                  onClick={handleUploadFile}
                                  startIcon={<CloudUploadIcon />}
                                  sx={{ borderRadius: 2 }}
                                >
                                  Upload
                                </Button>
                              )}
                              <IconButton
                                size="small"
                                onClick={handleRemoveFile}
                                sx={{ color: "#f44336" }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </>
                          )}
                          {uploadingFile && (
                            <CircularProgress size={24} />
                          )}
                        </Card>
                      )}

                      {!file && !uploadingFile && (
                        <Stack
                          direction="row"
                          spacing={2}
                          alignItems="center"
                          justifyContent="center"
                        >
                          <Button
                            variant="outlined"
                            component="label"
                            startIcon={<UploadFileIcon />}
                            sx={{
                              borderRadius: 2,
                            }}
                          >
                            Choose File
                            <input hidden type="file" onChange={handleFileUpload} />
                          </Button>
                          <Typography variant="caption" color="text.secondary">
                            Max file size: 100MB
                          </Typography>
                        </Stack>
                      )}
                    </Stack>
                  </Box>
                </Box>

                {/* Comments Section - Both View and Edit Mode */}
                {!isNewFeedback && selectedFeedback && (
                  <>
                    <Box>
                      <Typography
                        variant="h6"
                        fontWeight="700"
                        mb={3}
                        sx={{ color: "#37474f" }}
                      >
                        Comments ({comments.length})
                      </Typography>

                      {/* Comment Input */}
                      <Card
                        variant="outlined"
                        sx={{ mb: 3, borderRadius: 3, borderColor: "#cfd8dc" }}
                      >
                        <CardContent sx={{ p: 2 }}>
                          <Stack direction="row" spacing={2} alignItems="flex-start">
                            <Avatar sx={{ bgcolor: "#1976d2" }}>
                              <PersonIcon />
                            </Avatar>
                            <Box sx={{ flex: 1 }}>
                              <TextField
                                fullWidth
                                multiline
                                rows={3}
                                placeholder="Write a comment..."
                                value={commentInput}
                                onChange={(e) => setCommentInput(e.target.value)}
                                disabled={loading}
                                sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2 } }}
                              />
                              <Box display="flex" justifyContent="flex-end" mt={1.5}>
                                <Button
                                  variant="contained"
                                  onClick={handlePostComment}
                                  disabled={!commentInput.trim() || loading}
                                  endIcon={<SendIcon />}
                                  sx={{
                                    borderRadius: 2,
                                    fontWeight: 600,
                                    px: 3,
                                  }}
                                >
                                  Post
                                </Button>
                              </Box>
                            </Box>
                          </Stack>
                        </CardContent>
                      </Card>

                      {/* Comments List */}
                      <Stack spacing={2}>
                        {comments && comments.length > 0 ? (
                          [...comments].reverse().map((comment) => (
                            <Fade in={true} key={comment.id}>
                              <Card
                                variant="outlined"
                                sx={{
                                  borderRadius: 3,
                                  borderColor: "#e0e0e0",
                                  bgcolor: "#fafbfc",
                                }}
                              >
                                <CardContent sx={{ p: 3 }}>
                                  <Stack direction="row" spacing={2}>
                                    <Avatar sx={{ bgcolor: "#607d8b" }}>
                                      <PersonIcon />
                                    </Avatar>
                                    <Box sx={{ flex: 1 }}>
                                      <Stack
                                        direction="row"
                                        justifyContent="space-between"
                                        alignItems="flex-start"
                                        mb={1}
                                      >
                                        <Typography variant="subtitle2" fontWeight="600">
                                          {comment.user_id || "Anonymous"}
                                        </Typography>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                          <Typography variant="caption" color="text.secondary">
                                            {formatRelativeTime(comment.created_at)}
                                          </Typography>
                                          <Tooltip title="Delete comment">
                                            <IconButton
                                              size="small"
                                              onClick={() => handleDeleteComment(comment.id)}
                                              disabled={loading}
                                              sx={{
                                                color: "#ef5350",
                                                "&:hover": { bgcolor: "rgba(239, 83, 80, 0.08)" },
                                              }}
                                            >
                                              <DeleteIcon fontSize="small" />
                                            </IconButton>
                                          </Tooltip>
                                        </Stack>
                                      </Stack>
                                      <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                                        {comment.content}
                                      </Typography>
                                    </Box>
                                  </Stack>
                                </CardContent>
                              </Card>
                            </Fade>
                          ))
                        ) : (
                          <Box
                            sx={{
                              textAlign: "center",
                              py: 4,
                              bgcolor: "#fafbfc",
                              borderRadius: 3,
                            }}
                          >
                            <Typography variant="body2" color="text.secondary">
                              No comments yet. Be the first to comment!
                            </Typography>
                          </Box>
                        )}
                      </Stack>
                    </Box>

                    {/* Metadata */}
                    <Box
                      sx={{
                        mt: 3,
                        pt: 3,
                        borderTop: "1px solid #e0e0e0",
                      }}
                    >
                      <Typography variant="caption" color="text.secondary">
                        Created: {formatDate(selectedFeedback.created_at)} •{" "}
                        Updated: {formatDate(selectedFeedback.updated_at || selectedFeedback.created_at)}
                      </Typography>
                    </Box>
                  </>
                )}

                {/* Create Button */}
                {isNewFeedback && (
                  <Box mt={4}>
                    <Button
                      variant="contained"
                      onClick={handleCreateFeedback}
                      disabled={submitting || similarFeedbacks.length > 0}
                      fullWidth
                      size="large"
                      startIcon={submitting ? <CircularProgress size={20} /> : null}
                      sx={{
                        borderRadius: 3,
                        fontWeight: 700,
                        py: 2,
                        fontSize: "1.1rem",
                        bgcolor: "#1976d2",
                        "&:hover": { bgcolor: "#1565c0" },
                      }}
                    >
                      {submitting ? "Creating..." : "Create Feedback"}
                    </Button>
                  </Box>
                )}
              </Stack>
            </CardContent>
          </Card>
          </Box>
      </Container>
    </Box>
  );
};

export default FeedbackDetails;
