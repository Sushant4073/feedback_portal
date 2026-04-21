import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { FeedbackProvider } from "./contexts/FeedbackContext";
import FeedbackList from "./components/FeedbackList";
import FeedbackDetails from "./components/FeedbackDetails";

function App() {
  return (
    <FeedbackProvider>
      <Router>
        <Routes>
          <Route path="/" element={<FeedbackList />} />
          <Route path="/feedback" element={<FeedbackDetails mode="create" />} />
          <Route path="/feedback/:id" element={<FeedbackDetails mode="view" />} />
          <Route path="/feedback/:id/edit" element={<FeedbackDetails mode="edit" />} />
        </Routes>
      </Router>
    </FeedbackProvider>
  );
}

export default App;
