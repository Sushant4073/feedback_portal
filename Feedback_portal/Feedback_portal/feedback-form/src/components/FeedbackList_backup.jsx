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
} from "@mui/material";
import FavoriteIcon from "@mui/icons-material/Favorite";
import FavoriteBorderIcon from "@mui/icons-material/FavoriteBorder";
import ModeCommentIcon from "@mui/icons-material/ModeComment";
import AddIcon from "@mui/icons-material/Add";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
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
  Defect: {
    label: "Defect",
    color: "#f44336",
    bgcolor: "rgba(244, 67, 54, 0.12)",
  },
  Feature: {
    label: "Feature",
    color: "#9c27b0",
    bgcolor: "rgba(156, 39, 176, 0.12)",
  },
  Improvement: {
    label: "Improvement",
    color: "#009688",
    bgcolor: "rgba(0, 150, 136, 0.12)",
  },
  Other: {
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
        minHeight: "100vh",
        background: "linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%)",
        py: 4,
        px: 2,
      }}
    >
      <Container maxWidth="lg">
        {/* Header */}
        <Fade in={true} timeout={500}>
          <Card
            elevation={0}
            sx={{
              mb: 4,
              background: "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)",
              color: "white",
              borderRadius: 4,
            }}
          >
            <CardContent sx={{ py: 4, px: 4 }}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                spacing={2}
              >
                <Box>
                  <Typography variant="h4" fontWeight="700" gutterBottom>
                    Feedback Portal
                  </Typography>
                  <Typography variant="body1" sx={{ opacity: 0.9 }}>
                    Share your ideas, report issues, and help us improve
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
                    px: 3,
                    py: 1.5,
                    borderRadius: 2,
                    "&:hover": {
                      bgcolor: "rgba(255, 255, 255, 0.9)",
                      transform: "translateY(-2px)",
                    },
                  }}
                >
                  Create Feedback
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Fade>

        {/* Filter Tabs */}
        <Fade in={true} timeout={600}>
          <Card
            elevation={1}
            sx={{
              mb: 4,
              borderRadius: 3,
              bgcolor: "white",
              px: 2,
              py: 1.5,
            }}
          >
            <Stack direction="row" spacing={1.5}>
              <Button
                onClick={() => toggleFeedback(false)}
                sx={{
                  borderRadius: 3,
                  px: 3,
                  fontWeight: 600,
                  bgcolor: !showMyFeedback ? "#e3f2fd" : "transparent",
                  color: !showMyFeedback ? "#1976d2" : "text.secondary",
                  "&:hover": {
                    bgcolor: !showMyFeedback ? "#e3f2fd" : "rgba(25, 118, 210, 0.08)",
                  },
                }}
              >
                All Feedback
              </Button>
              <Button
                onClick={() => toggleFeedback(true)}
                sx={{
                  borderRadius: 3,
                  px: 3,
                  fontWeight: 600,
                  bgcolor: showMyFeedback ? "#e3f2fd" : "transparent",
                  color: showMyFeedback ? "#1976d2" : "text.secondary",
                  "&:hover": {
                    bgcolor: showMyFeedback ? "#e3f2fd" : "rgba(25, 118, 210, 0.08)",
                  },
                }}
              >
                My Feedback
              </Button>
            </Stack>
          </Card>
        </Fade>

        {/* Loading State */}
        {loading && (
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
        <Stack spacing={2.5}>
          {feedbacks.map((feedback, index) => {
            const statusConfig = STATUS_CONFIG[feedback.status] || { color: "#757575", label: feedback.status, bgcolor: "rgba(117, 117, 117, 0.12)" };
            const categoryConfig = CATEGORY_CONFIG[feedback.category] || { color: "#607d8b", label: feedback.category, bgcolor: "rgba(96, 125, 139, 0.12)" };
            const isVoted = votedFeedbacks.has(feedback.id);
            const isVoting = votingProgress.has(feedback.id);

            return (
              <Fade
                key={feedback.id}
                in={true}
                timeout={300}
                style={{ transitionDelay: `${index * 50}ms` }}
              >
                <Card
                  elevation={2}
                  sx={{
                    transition: "all 0.3s ease",
                    borderRadius: 3,
                    "&:hover": {
                      boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
                      transform: "translateY(-2px)",
                    },
                  }}
                >
                  <CardContent sx={{ py: 3 }}>
                    <Stack
                      direction={{ xs: "column", sm: "row" }}
                      justifyContent="space-between"
                      spacing={2}
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

                        <Typography
                          variant="h6"
                          fontWeight="600"
                          mb={1}
                          sx={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                          }}
                        >
                          {feedback.title}
                        </Typography>

                        <Typography
                          variant="body2"
                          color="text.secondary"
                          sx={{
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {formatDescription(feedback.description)}
                        </Typography>

                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: { xs: "block", sm: "none" }, mt: 1.5 }}
                        >
                          {formatDate(feedback.created_at)}
                        </Typography>
                      </Box>

                      <Stack
                        spacing={3}
                        alignItems={{ xs: "flex-start", sm: "center" }}
                        sx={{ minWidth: { sm: 120 } }}
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
                              gap: 0.75,
                              cursor: "pointer",
                              opacity: isVoting ? 0.5 : 1,
                              transition: "all 0.2s",
                              "&:hover": {
                                transform: "scale(1.1)",
                              },
                            }}
                            onClick={(e) => handleVoteToggle(e, feedback.id)}
                          >
                            {isVoted ? (
                              <FavoriteIcon
                                sx={{
                                  fontSize: 28,
                                  color: "#e91e63",
                                  filter: "drop-shadow(0 2px 4px rgba(233, 30, 99, 0.3))",
                                }}
                              />
                            ) : (
                              <FavoriteBorderIcon
                                sx={{
                                  fontSize: 28,
                                  color: "#90a4ae",
                                }}
                              />
                            )}
                            <Typography
                              fontWeight="700"
                              sx={{
                                fontSize: "1.1rem",
                                color: isVoted ? "#e91e63" : "text.primary",
                              }}
                            >
                              {feedback.vote_count || 0}
                            </Typography>
                          </Box>
                        </Tooltip>

                        {/* Comment Count */}
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                            cursor: "pointer",
                            color: "#1976d2",
                            transition: "all 0.2s",
                            "&:hover": {
                              textDecoration: "underline",
                              transform: "translateY(-2px)",
                            },
                          }}
                          onClick={() => handleClickFeedback(feedback.id)}
                        >
                          <ModeCommentIcon sx={{ fontSize: 22 }} />
                          <Typography fontWeight="700" variant="body2">
                            {feedback.comment_count || 0}
                          </Typography>
                        </Box>
                        {/* View Details Link */}
                        <Box
                          sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                            cursor: "pointer",
                            color: "#1976d2",
                            transition: "all 0.2s",
                            "&:hover": {
                              textDecoration: "underline",
                              transform: "translateY(-2px)",
                            },
                          }}
                          onClick={() => handleClickFeedback(feedback.id)}
                        >
                          <ModeCommentIcon sx={{ fontSize: 22 }} />
                          <Typography fontWeight="600" variant="body2">
                            View Details
                          </Typography>
                        </Box>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Fade>
            );
          })}
        </Stack>
      </Container>
    </Box>
  );
};

export default FeedbackList;
