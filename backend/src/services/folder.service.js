export class FolderService {
  static async createFolder(user, dto) {  //user and dto are two objects
    const parent = await Folder.findOne({
      _id: dto.parentFolderId,
      ownerId: user.id,
      isDeleted: false,
    });

    if (!parent) throw new Error("Invalid parent folder");

    const path =
      parent.path === "/" ? `/${dto.name}` : `${parent.path}/${dto.name}`;

    return Folder.create({
      ownerId: user.id,
      name: dto.name,
      parentFolderId: parent._id,
      path,
      isDeleted: false,
    });
  }
}

