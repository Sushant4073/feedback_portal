import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Chip,
  Card,
  CardContent,
  Stack,
  Typography,
  Container,
  Fade,
  CircularProgress,
  Divider,
  Tooltip,
  IconButton,
  Pagination,
} from "@mui/material";
import ThumbUpIcon from "@mui/icons-material/ThumbUp";
import ThumbUpOutlinedIcon from "@mui/icons-material/ThumbUpOutlined";
import ModeCommentIcon from "@mui/icons-material/ModeComment";
import AddIcon from "@mui/icons-material/Add";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import VisibilityIcon from "@mui/icons-material/Visibility";
import ArticleIcon from "@mui/icons-material/Article";
import PersonIcon from "@mui/icons-material/Person";
import CalendarTodayIcon from "@mui/icons-material/CalendarToday";
import { useFeedback } from "../contexts/FeedbackContext";

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

const FeedbackList = () => {
  const navigate = useNavigate();
  const { tenantId, userId, toggleVote, feedbacks, loading, loadFeedbacks } = useFeedback();
  const [showMyFeedback, setShowMyFeedback] = useState(false);
  const [votedFeedbacks, setVotedFeedbacks] = useState(new Set());
  const [votingProgress, setVotingProgress] = useState(new Set());
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [page, setPage] = useState(1);
  const FEEDBACKS_PER_PAGE = 6;

  // Load voted feedbacks from localStorage on mount
  useEffect(() => {
    const savedVotes = localStorage.getItem("votedFeedbacks");
    if (savedVotes) {
      setVotedFeedbacks(new Set(JSON.parse(savedVotes)));
    }
  }, []);

  const fetchFeedbacks = async () => {
    const filters = { tenant_id: tenantId };
    if (showMyFeedback) {
      filters.user_id = userId;
    }
    await loadFeedbacks(filters);
  };

  useEffect(() => {
    fetchFeedbacks();
  }, [tenantId, showMyFeedback]);

  useEffect(() => {
    if (!loading && feedbacks.length >= 0) {
      setInitialLoadDone(true);
    }
  }, [loading, feedbacks]);

  const toggleFeedback = (myFeedback) => {
    setShowMyFeedback(myFeedback);
  };

  const handleClickFeedback = (feedbackId) => {
    console.log("Navigating to feedback:", feedbackId, "Full URL:", `/feedback/${feedbackId}`);
    navigate(`/feedback/${feedbackId}`);
  };

  const handleVoteToggle = async (e, feedbackId) => {
    e.stopPropagation(); // Prevent card click navigation
    if (votingProgress.has(feedbackId)) {
      return; // Prevent double clicks
    }

    setVotingProgress((prev) => new Set([...prev, feedbackId]));

    try {
      const result = await toggleVote(feedbackId);
      // Note: toggleVote already updates vote_count via context
      if (result.message === "voted") {
        setVotedFeedbacks((prev) => {
          const newSet = new Set([...prev, feedbackId]);
          localStorage.setItem("votedFeedbacks", JSON.stringify([...newSet]));
          return newSet;
        });
      } else {
        setVotedFeedbacks((prev) => {
          const newSet = new Set(prev);
          newSet.delete(feedbackId);
          localStorage.setItem("votedFeedbacks", JSON.stringify([...newSet]));
          return newSet;
        });
      }
    } catch (error) {
      console.error("Failed to toggle vote:", error);
    } finally {
      setVotingProgress((prev) => {
        const newSet = new Set(prev);
        newSet.delete(feedbackId);
        return newSet;
      });
    }
  };

  const formatDescription = (text) => {
    if (!text) return "";
    return text.length > 180 ? text.substring(0, 180) + "..." : text;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
        {/* Header */}
        <Fade in={true} timeout={500}>
          <Card
            elevation={0}
            sx={{
              mb: 2,
              background: "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)",
              color: "white",
              borderRadius: 2,
              flexShrink: 0,
            }}
          >
            <CardContent sx={{ py: 2, px: 3 }}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
              >
                <Box>
                  <Typography variant="h5" fontWeight="700" sx={{ fontSize: "1.4rem" }}>
                    Feedback Portal
                  </Typography>
                  <Typography variant="body1" sx={{
                    mt: 0.5,
                    opacity: 0.9,
                    fontSize: "0.9rem"
                  }}>
                    Share your ideas, report issues, help us improve
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  onClick={() => navigate(`/feedback`)}
                  startIcon={<AddIcon />}
                  sx={{
                    bgcolor: "white",
                    color: "#1976d2",
                    fontWeight: 600,
                    px: 2.5,
                    py: 1,
                    borderRadius: 2,
                    fontSize: "0.875rem",
                    "&:hover": {
                      bgcolor: "rgba(255, 255, 255, 0.9)",
                    },
                  }}
                >
                  Create
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Fade>

        {/* Filter Tabs */}
        <Card
          elevation={0}
          sx={{
            mb: 2,
            borderRadius: 2,
            bgcolor: "transparent",
          }}
        >
            <Stack direction="row" spacing={1}>
              <Button
                onClick={() => toggleFeedback(false)}
                sx={{
                  borderRadius: 2,
                  px: 2,
                  py: 0.75,
                  fontWeight: 600,
                  bgcolor: !showMyFeedback ? "#1976d2" : "transparent",
                  color: !showMyFeedback ? "white" : "text.secondary",
                  fontSize: "0.875rem",
                  "&:hover": {
                    bgcolor: !showMyFeedback ? "#1565c0" : "rgba(25, 118, 210, 0.08)",
                  },
                }}
              >
                All Feedback
              </Button>
              <Button
                onClick={() => toggleFeedback(true)}
                sx={{
                  borderRadius: 2,
                  px: 2,
                  py: 0.75,
                  fontWeight: 600,
                  bgcolor: showMyFeedback ? "#1976d2" : "transparent",
                  color: showMyFeedback ? "white" : "text.secondary",
                  fontSize: "0.875rem",
                  "&:hover": {
                    bgcolor: showMyFeedback ? "#1565c0" : "rgba(25, 118, 210, 0.08)",
                  },
                }}
              >
                My Feedback
              </Button>
            </Stack>
          </Card>

        {/* Content Area - Scrollable */}
        <Box
          sx={{
            flex: 1,
            overflow: "auto",
            minHeight: 0,
          }}
        >
          {/* Loading State - only on initial load, not when voting */}
          {!initialLoadDone && loading && (
            <Box display="flex" justifyContent="center" py={8}>
              <CircularProgress size={48} sx={{ color: "#1976d2" }} />
            </Box>
          )}

          {/* Empty State */}
          {!loading && feedbacks.length === 0 && (
            <Fade in={true} timeout={400}>
              <Card
                elevation={0}
                sx={{
                  py: 12,
                  textAlign: "center",
                  borderRadius: 4,
                  bgcolor: "white",
                }}
              >
                <Typography variant="h6" color="text.secondary" gutterBottom>
                  No feedback found
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Create your first feedback to get started!
                </Typography>
              </Card>
            </Fade>
          )}

          {/* Feedback Cards */}
          <Stack spacing={1.5} mb={2} sx={{ transition: "opacity 0.15s ease-in-out" }}>
          {feedbacks
            .slice((page - 1) * FEEDBACKS_PER_PAGE, page * FEEDBACKS_PER_PAGE)
            .map((feedback, index) => {
            const statusConfig = STATUS_CONFIG[feedback.status] || { color: "#757575", label: feedback.status, bgcolor: "rgba(117, 117, 117, 0.12)" };
            const categoryConfig = CATEGORY_CONFIG[feedback.category] || { color: "#607d8b", label: feedback.category, bgcolor: "rgba(96, 125, 139, 0.12)" };
            const isVoted = votedFeedbacks.has(feedback.id);
            const isVoting = votingProgress.has(feedback.id);

            return (
              <Card
                  elevation={1}
                  sx={{
                    transition: "all 0.2s ease",
                    borderRadius: 2,
                    "&:hover": {
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                      transform: "translateY(-1px)",
                    },
                  }}
                >
                  <CardContent sx={{ py: 1.5, px: 2 }}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      justifyContent="space-between"
                      spacing={1.5}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        {/* Status and Category Chips */}
                        <Stack direction="row" spacing={1.5} mb={2} flexWrap="wrap">
                          <Chip
                            label={statusConfig.label}
                            sx={{
                              borderRadius: 2,
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              px: 1.5,
                              py: 0.5,
                              bgcolor: statusConfig.bgcolor,
                              color: statusConfig.color,
                            }}
                          />
                          <Chip
                            label={categoryConfig.label}
                            sx={{
                              borderRadius: 2,
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              px: 1.5,
                              py: 0.5,
                              bgcolor: categoryConfig.bgcolor,
                              color: categoryConfig.color,
                            }}
                          />
                        </Stack>

                        {/* Title with enhanced styling */}
                        <Box
                          sx={{
                            mb: 1,
                          }}
                        >
                          <Typography
                            variant="h6"
                            fontWeight="700"
                            sx={{
                              color: "#334155",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              lineHeight: 1.4,
                            }}
                          >
                            {feedback.title}
                          </Typography>
                        </Box>

                        {/* Description with card-like styling */}
                        <Box
                          sx={{
                            bgcolor: "rgba(25, 118, 210, 0.03)",
                            borderRadius: 2,
                            p: 1,
                            px: 1.5,
                            borderLeft: "3px solid #1976d2",
                            position: "relative",
                            overflow: "hidden",
                          }}
                        >
                          <ArticleIcon
                            sx={{
                              position: "absolute",
                              right: -8,
                              top: -8,
                              fontSize: 64,
                              color: "rgba(25, 118, 210, 0.05)",
                              transform: "rotate(15deg)",
                            }}
                          />
                          <Typography
                            variant="caption"
                            sx={{
                              color: "#1976d2",
                              fontWeight: 700,
                              mb: 0.5,
                              display: "block",
                              textTransform: "uppercase",
                              fontSize: "0.7rem",
                              letterSpacing: 0.5,
                            }}
                          >
                            Description
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              color: "#455a64",
                              lineHeight: 1.6,
                              position: "relative",
                              zIndex: 1,
                            }}
                          >
                            {formatDescription(feedback.description)}
                          </Typography>
                        </Box>

                        {/* Metadata footer */}
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                            mt: 1,
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                              color: "#78909c",
                              fontWeight: 500,
                            }}
                          >
                            <PersonIcon sx={{ fontSize: 14, color: "#78909c" }} />
                            {feedback.user_id || "Anonymous"}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.5,
                              color: "#78909c",
                              fontWeight: 500,
                            }}
                          >
                            <CalendarTodayIcon sx={{ fontSize: 14, color: "#78909c" }} />
                            {formatDate(feedback.created_at)}
                          </Typography>
                        </Box>
                      </Box>

                      {/* Actions Column */}
                      <Stack
                        spacing={1.5}
                        alignItems={{ xs: "flex-start", sm: "center" }}
                        sx={{ minWidth: { sm: 80 }, ml: { xs: 0, sm: 2 } }}
                      >
                        {/* Vote Button */}
                        <Tooltip
                          title={isVoted ? "Remove vote" : "Vote"}
                          arrow
                        >
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              cursor: "pointer",
                              transition: "all 0.2s",
                              px: 2,
                              py: 1,
                              borderRadius: 2,
                              bgcolor: isVoted ? "rgba(25, 118, 210, 0.15)" : "rgba(25, 118, 210, 0.06)",
                              "&:hover": {
                                transform: "scale(1.05)",
                                bgcolor: isVoted ? "rgba(25, 118, 210, 0.22)" : "rgba(25, 118, 210, 0.12)",
                              },
                            }}
                            onClick={(e) => handleVoteToggle(e, feedback.id)}
                          >
                            <ThumbUpIcon
                              sx={{
                                fontSize: 22,
                                color: isVoted ? "#1976d2" : "#546e7a",
                              }}
                            />
                            <Typography
                              fontWeight="600"
                              sx={{
                                fontSize: "1rem",
                                color: isVoted ? "#1976d2" : "text.primary",
                              }}
                            >
                              {feedback.vote_count || 0}
                            </Typography>
                          </Box>
                        </Tooltip>

                        {/* Comment Count (display only, not clickable) */}
                        <Tooltip title="Comment count" arrow>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              px: 2,
                              py: 1,
                              borderRadius: 2,
                              bgcolor: "rgba(0, 0, 0, 0.04)",
                              transition: "all 0.2s",
                              cursor: "default",
                              "&:hover": {
                                bgcolor: "rgba(0, 0, 0, 0.08)",
                                transform: "scale(1.05)",
                              },
                            }}
                          >
                            <ChatBubbleOutlineIcon sx={{ fontSize: 20, color: "#78909c" }} />
                            <Typography fontWeight="600" variant="body2" sx={{ color: "#546e7a" }}>
                              {feedback.comment_count || 0}
                            </Typography>
                          </Box>
                        </Tooltip>

                        {/* View Details */}
                        <Tooltip title="View full details" arrow>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              cursor: "pointer",
                              transition: "all 0.2s",
                              px: 2,
                              py: 1,
                              borderRadius: 2,
                              color: "#2e7d32",
                              bgcolor: "rgba(46, 125, 50, 0.08)",
                              "&:hover": {
                                bgcolor: "rgba(46, 125, 50, 0.15)",
                                transform: "translateX(3px)",
                              },
                            }}
                            onClick={() => handleClickFeedback(feedback.id)}
                          >
                            <VisibilityIcon sx={{ fontSize: 20 }} />
                            <Typography fontWeight="600" variant="body2">
                              View Details
                            </Typography>
                          </Box>
                        </Tooltip>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
            );
          })}
        </Stack>

        {/* Pagination */}
        {feedbacks.length > FEEDBACKS_PER_PAGE && (
          <Box display="flex" justifyContent="center" py={2}>
            <Pagination
              count={Math.ceil(feedbacks.length / FEEDBACKS_PER_PAGE)}
              page={page}
              onChange={(_, newPage) => {
                setPage(newPage);
              }}
              color="primary"
              size="medium"
              showFirstButton
              showLastButton
            />
          </Box>
        )}
        </Box>
      </Container>
    </Box>
  );
};

export default FeedbackList;
