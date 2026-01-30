import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

// impoer routes
import authRoutes from './routes/auth.routes.js';
import fileRoutes from './routes/file.routes.js';
import folderRoutes from './routes/folder.routes.js';
import { get } from 'mongoose';

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
  })
);

// Routes 
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/info',getInfoRoutes);


// Public protected route example


export { app } 