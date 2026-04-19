import express from 'express';
import { errorHandler } from './middleware/errorHandler';
import { authRoutes } from "./routes/authRoutes";
import { movieRoutes } from './routes/movieRoutes';
import { userPreferenceRoutes } from './routes/userPreferenceRoutes';
import { healthRoutes } from "./routes/healthRoutes";
import { watchlistRoutes } from './routes/watchlistRoutes';

export const app = express();

app.use(express.json());

app.use('/api', healthRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user-preferences', userPreferenceRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use((_req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route is not found',
      details: null,
    },
  });
});
app.use(errorHandler);
