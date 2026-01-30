import { FolderService } from "../services/folder.service.js";


export const createNewFolder = async (req, res) => {
  const data = await FolderService.createNewFolder(req.user, req.body);
  res.json(data);
};


