import { createContext, useContext, useState, useCallback, useEffect } from "react";
import {
  createFeedback,
  getFeedback,
  listFeedback,
  updateFeedbackStatus,
  deleteFeedback,
  createComment,
  getComments,
  deleteComment,
  postVote,
} from "../services/api";

const FeedbackContext = createContext(null);

// Default values for tenant and user (in production, this would come from auth)
const DEFAULT_TENANT_ID = "default-tenant";
const DEFAULT_USER_ID = "default-user";

export const FeedbackProvider = ({ children }) => {
  const [tenantId] = useState(DEFAULT_TENANT_ID);
  const [userId] = useState(DEFAULT_USER_ID);
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [comments, setComments] = useState([]);

  // Load all feedbacks
  const loadFeedbacks = useCallback(
    async (filters = {}) => {
      setLoading(true);
      setError(null);
      try {
        const data = await listFeedback(tenantId, filters);
        setFeedbacks(data);
      } catch (err) {
        setError(err.message || "Failed to load feedbacks");
      } finally {
        setLoading(false);
      }
    },
    [tenantId]
  );

  // Load a specific feedback
  const loadFeedback = useCallback(
    async (id) => {
      setLoading(true);
      setError(null);
      try {
        console.log("Loading feedback with id:", id);
        const data = await getFeedback(id);
        console.log("Feedback loaded:", data);
        setSelectedFeedback(data);
        return data;
      } catch (err) {
        console.error("Failed to load feedback:", err);
        setError(err.message || "Failed to load feedback");
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Create new feedback
  const createNewFeedback = useCallback(
    async (feedbackData) => {
      setLoading(true);
      setError(null);
      try {
        const data = await createFeedback({
          ...feedbackData,
          tenant_id: tenantId,
          user_id: userId,
        });
        setFeedbacks((prev) => [data, ...prev]);
        return data;
      } catch (err) {
        setError(err.message || "Failed to create feedback");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [tenantId, userId]
  );

  // Update feedback status
  const updateStatus = useCallback(
    async (id, status) => {
      setLoading(true);
      setError(null);
      try {
        const data = await updateFeedbackStatus(id, status);
        setFeedbacks((prev) =>
          prev.map((f) => (f.id === id ? data : f))
        );
        if (selectedFeedback?.id === id) {
          setSelectedFeedback(data);
        }
        return data;
      } catch (err) {
        setError(err.message || "Failed to update status");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [selectedFeedback]
  );

  // Delete feedback
  const deleteFeedbackById = useCallback(
    async (id) => {
      setLoading(true);
      setError(null);
      try {
        await deleteFeedback(id);
        setFeedbacks((prev) => prev.filter((f) => f.id !== id));
        if (selectedFeedback?.id === id) {
          setSelectedFeedback(null);
        }
      } catch (err) {
        setError(err.message || "Failed to delete feedback");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [selectedFeedback]
  );

  // Load comments for a feedback
  const loadComments = useCallback(
    async (feedbackId) => {
      setLoading(true);
      setError(null);
      try {
        const data = await getComments(feedbackId);
        setComments(data);
        return data;
      } catch (err) {
        setError(err.message || "Failed to load comments");
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Add a comment
  const addComment = useCallback(
    async (feedbackId, content) => {
      setLoading(true);
      setError(null);
      try {
        const data = await createComment(feedbackId, userId, content);
        setComments((prev) => [...prev, data]);
        return data;
      } catch (err) {
        setError(err.message || "Failed to add comment");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  // Delete a comment
  const deleteCommentById = useCallback(
    async (commentId) => {
      setLoading(true);
      setError(null);
      try {
        await deleteComment(commentId, userId);
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } catch (err) {
        setError(err.message || "Failed to delete comment");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [userId]
  );

  // Toggle vote on feedback
  const toggleVote = useCallback(
    async (feedbackId) => {
      setLoading(true);
      setError(null);
      try {
        const result = await postVote(feedbackId, userId);
        // Refresh feedback to get updated vote count
        if (result.message === "voted") {
          // Vote added, increment local count
          setFeedbacks((prev) =>
            prev.map((f) =>
              f.id === feedbackId
                ? { ...f, vote_count: f.vote_count + 1 }
                : f
            )
          );
          if (selectedFeedback?.id === feedbackId) {
            setSelectedFeedback((prev) => ({
              ...prev,
              vote_count: prev.vote_count + 1,
            }));
          }
        } else {
          // Vote removed, decrement local count
          setFeedbacks((prev) =>
            prev.map((f) =>
              f.id === feedbackId
                ? { ...f, vote_count: Math.max(f.vote_count - 1, 0) }
                : f
            )
          );
          if (selectedFeedback?.id === feedbackId) {
            setSelectedFeedback((prev) => ({
              ...prev,
              vote_count: Math.max(prev.vote_count - 1, 0),
            }));
          }
        }
        return result;
      } catch (err) {
        setError(err.message || "Failed to vote");
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [userId, selectedFeedback]
  );

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = {
    // State
    tenantId,
    userId,
    feedbacks,
    loading,
    error,
    selectedFeedback,
    comments,
    // Actions
    loadFeedbacks,
    loadFeedback,
    createNewFeedback,
    updateStatus,
    deleteFeedbackById,
    loadComments,
    addComment,
    deleteCommentById,
    toggleVote,
    clearError,
  };

  return (
    <FeedbackContext.Provider value={value}>
      {children}
    </FeedbackContext.Provider>
  );
};

export const useFeedback = () => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error("useFeedback must be used within FeedbackProvider");
  }
  return context;
};
