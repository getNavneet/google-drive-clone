export class StorageProvider {
  getUploadUrl() {
    throw new Error("Not implemented");
  }

  getDownloadUrl() {
    throw new Error("Not implemented");
  }

  deleteObject() {
    throw new Error("Not implemented");
  }
}


//currently not used 

// import { StorageProvider } from "./StorageProvider.js";

// export class S3Storage extends StorageProvider {
//   async getUploadUrl({ key, mimeType }) {
//     ...
//   }

//   async getDownloadUrl(key) {
//     ...
//   }

//   async deleteObject(key) {
//     ...
//   }
// }

