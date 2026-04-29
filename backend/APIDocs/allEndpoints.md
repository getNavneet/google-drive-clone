# all api endpoints 

## auth routes /api/auth (auth.routes.js)

- /api/auth/status
- /api/auth/register
- /api/auth/login
- /api/auth/logout
- /api/auth/me
- /api/auth/delete-account

## file routes /api/files (file.routes.js)

- /api/files/status (get)
- /api/files/upload-url (post)
- /api/files/confirm-upload  (post)
- /api/files/get-previews (post)
- /api/files/preview-webhook (post)
- /api/files/search  (get)
- /api/files/by-tags  (post)
- /api/files/stats  (get)
- /api/files/:fileId  (get)
- /api/files/folder/:folderId  (get)
- /api/files/:fileId  (delete)
- /api/files/batch-delete (post)
- /api/files/:fileId/move  (put)
- /api/files/:fileId/rename (put)
- /api/files/:fileId/tags  (put)
- /api/files/:fileId/description  (put)

## folder routes /api/folders (folder.routes.js)

- /api/folders/status           (get)
- /api/folders/ensure-root          (post)
- /api/folders/create           (post)
- /api/folders/:folderId            (get)
- /api/folders/:folderId/list       (get)
- /api/folders/:folderId            (delete)
- /api/folders/:folderId/rename         (put)
- /api/folders/:folderId/move           (put)
- /api/folders/:folderId/restore            (post)
- /api/folders/:folderId/path           (get)
- /api/folders/:folderId/stats          (get)
- /api/folders/search          (get)

## get info routes /api/info (getInfo.routes.js)

- /api/info/status (get)
- /api/info/available-storage (get)