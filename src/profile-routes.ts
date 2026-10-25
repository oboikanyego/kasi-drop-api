import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import mongoose from 'mongoose';
import { UserModel } from './models.js';
import {
  addressInputSchema,
  appendAddress,
  detectAvatarMime,
  editAddress,
  maxAvatarBytes,
  profileUpdateSchema,
  removeAddress,
  setDefaultAddress,
  formatProfile,
  type SavedAddress,
} from './profile-rules.js';

type Identity = { sub: string; email: string; name: string; role: 'admin' | 'customer' };
type Avatar = { bytes: Buffer; mime: string; updatedAt: Date };
type DemoProfile = {
  phone: string;
  about: string;
  preferredLanguage: string;
  marketingOptIn: boolean;
  addresses: SavedAddress[];
  avatar?: Avatar;
  memberSince: string;
};

export function registerProfileRoutes(
  app: Express,
  guard: RequestHandler,
  identity: (req: Request) => Identity | null,
  demo: boolean,
  getDemoUser: (
    id: string,
  ) => { id: string; name: string; email: string; role: 'admin' | 'customer' } | undefined,
) {
  const demoProfiles = new Map<string, DemoProfile>();
  const fail =
    (handler: (req: Request, res: Response) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction) =>
      Promise.resolve(handler(req, res)).catch(next);
  const idFrom = (req: Request) => identity(req)!.sub;
  const validId = (id: string) => mongoose.isValidObjectId(id);
  function lookupDemo(id: string) {
    const user = getDemoUser(id);
    if (!user) return null;
    if (!demoProfiles.has(id))
      demoProfiles.set(id, {
        phone: '',
        about: '',
        preferredLanguage: 'English',
        marketingOptIn: false,
        addresses: [],
        memberSince: new Date().toISOString(),
      });
    return { user, profile: demoProfiles.get(id)! };
  }
  async function findUser(id: string) {
    if (!validId(id)) return null;
    return UserModel.findById(id);
  }

  app.get(
    '/api/profile',
    guard,
    fail(async (req, res) => {
      const uid = idFrom(req);
      if (demo) {
        const found = lookupDemo(uid);
        if (!found) {
          res.sendStatus(404);
          return;
        }
        res.json({
          profile: formatProfile(
            { ...found.user, ...found.profile, avatarUpdatedAt: found.profile.avatar?.updatedAt },
            uid,
          ),
        });
        return;
      }
      const user = await findUser(uid);
      if (!user) {
        res.sendStatus(404);
        return;
      }
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ profile: formatProfile(user) });
    }),
  );

  app.patch(
    '/api/profile',
    guard,
    fail(async (req, res) => {
      const changes = profileUpdateSchema.parse(req.body);
      const uid = idFrom(req);
      if (demo) {
        const found = lookupDemo(uid);
        if (!found) {
          res.sendStatus(404);
          return;
        }
        if (changes.name) found.user.name = changes.name;
        Object.assign(
          found.profile,
          Object.fromEntries(Object.entries(changes).filter(([k]) => k !== 'name')),
        );
        res.json({
          profile: formatProfile(
            { ...found.user, ...found.profile, avatarUpdatedAt: found.profile.avatar?.updatedAt },
            uid,
          ),
        });
        return;
      }
      if (!validId(uid)) {
        res.sendStatus(404);
        return;
      }
      const user = await UserModel.findByIdAndUpdate(
        uid,
        { $set: changes },
        { new: true, runValidators: true },
      );
      if (!user) {
        res.sendStatus(404);
        return;
      }
      res.json({ profile: formatProfile(user) });
    }),
  );

  async function getAddresses(uid: string): Promise<SavedAddress[] | null> {
    if (demo) {
      return lookupDemo(uid)?.profile.addresses ?? null;
    }
    const user = await findUser(uid);
    return user ? formatProfile(user).addresses : null;
  }
  async function saveAddresses(uid: string, addresses: SavedAddress[]) {
    if (demo) {
      const found = lookupDemo(uid);
      if (!found) return false;
      found.profile.addresses = addresses;
      return true;
    }
    if (!validId(uid)) return false;
    const result = await UserModel.updateOne({ _id: uid }, { $set: { addresses } });
    return result.matchedCount === 1;
  }
  app.get(
    '/api/profile/addresses',
    guard,
    fail(async (req, res) => {
      const addresses = await getAddresses(idFrom(req));
      if (!addresses) {
        res.sendStatus(404);
        return;
      }
      res.setHeader('Cache-Control', 'private, no-store');
      res.json({ addresses });
    }),
  );
  app.post(
    '/api/profile/addresses',
    guard,
    fail(async (req, res) => {
      const input = addressInputSchema.parse(req.body),
        uid = idFrom(req);
      const current = await getAddresses(uid);
      if (!current) {
        res.sendStatus(404);
        return;
      }
      if (current.length >= 10) {
        res.status(409).json({ error: 'Maximum of 10 saved addresses reached' });
        return;
      }
      const addresses = appendAddress(current, input);
      if (!(await saveAddresses(uid, addresses))) {
        res.sendStatus(404);
        return;
      }
      res.status(201).json({ addresses });
    }),
  );
  app.put(
    '/api/profile/addresses/:id',
    guard,
    fail(async (req, res) => {
      const input = addressInputSchema.parse(req.body),
        uid = idFrom(req);
      const current = await getAddresses(uid);
      if (!current) {
        res.sendStatus(404);
        return;
      }
      const addresses = editAddress(current, String(req.params.id), input);
      if (!addresses) {
        res.sendStatus(404);
        return;
      }
      if (!(await saveAddresses(uid, addresses))) {
        res.sendStatus(404);
        return;
      }
      res.json({ addresses });
    }),
  );
  app.patch(
    '/api/profile/addresses/:id/default',
    guard,
    fail(async (req, res) => {
      const uid = idFrom(req),
        current = await getAddresses(uid);
      if (!current) {
        res.sendStatus(404);
        return;
      }
      const addresses = setDefaultAddress(current, String(req.params.id));
      if (!addresses) {
        res.sendStatus(404);
        return;
      }
      if (!(await saveAddresses(uid, addresses))) {
        res.sendStatus(404);
        return;
      }
      res.json({ addresses });
    }),
  );
  app.delete(
    '/api/profile/addresses/:id',
    guard,
    fail(async (req, res) => {
      const uid = idFrom(req),
        current = await getAddresses(uid);
      if (!current) {
        res.sendStatus(404);
        return;
      }
      const addresses = removeAddress(current, String(req.params.id));
      if (!addresses) {
        res.sendStatus(404);
        return;
      }
      if (!(await saveAddresses(uid, addresses))) {
        res.sendStatus(404);
        return;
      }
      res.json({ addresses });
    }),
  );

  const avatarParser = express.raw({
    type: ['image/png', 'image/jpeg', 'image/webp'],
    limit: maxAvatarBytes,
  });
  const avatarRateLimit = (req: Request, res: Response, next: NextFunction) => next();
  app.put(
    '/api/profile/avatar',
    guard,
    avatarRateLimit,
    avatarParser,
    fail(async (req, res) => {
      const bytes = req.body;
      if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > maxAvatarBytes) {
        res.status(415).json({ error: 'Upload a JPEG, PNG or WebP image smaller than 512 KB' });
        return;
      }
      const mime = detectAvatarMime(bytes);
      if (!mime || req.headers['content-type']?.split(';')[0]?.trim().toLowerCase() !== mime) {
        res.status(415).json({ error: 'Unsupported image type. Upload JPEG, PNG or WebP' });
        return;
      }
      const uid = idFrom(req),
        updatedAt = new Date();
      if (demo) {
        const found = lookupDemo(uid);
        if (!found) {
          res.sendStatus(404);
          return;
        }
        found.profile.avatar = { bytes: Buffer.from(bytes), mime, updatedAt };
      } else {
        if (!validId(uid)) {
          res.sendStatus(404);
          return;
        }
        const result = await UserModel.updateOne(
          { _id: uid },
          { $set: { avatarData: bytes, avatarMime: mime, avatarUpdatedAt: updatedAt } },
        );
        if (result.matchedCount !== 1) {
          res.sendStatus(404);
          return;
        }
      }
      res.json({ avatarUpdatedAt: updatedAt.toISOString() });
    }),
  );
  app.get(
    '/api/profile/avatar',
    guard,
    fail(async (req, res) => {
      const uid = idFrom(req);
      let avatar: Avatar | undefined;
      if (demo) avatar = lookupDemo(uid)?.profile.avatar;
      else if (validId(uid)) {
        const user = await UserModel.findById(uid).select('+avatarData');
        if (user?.avatarData?.length && user.avatarMime)
          avatar = {
            bytes: user.avatarData,
            mime: user.avatarMime,
            updatedAt: user.avatarUpdatedAt || new Date(),
          };
      }
      if (!avatar) {
        res.sendStatus(404);
        return;
      }
      res.setHeader('Content-Type', avatar.mime);
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline; filename="profile-image"');
      res.send(avatar.bytes);
    }),
  );
  app.delete(
    '/api/profile/avatar',
    guard,
    fail(async (req, res) => {
      const uid = idFrom(req);
      if (demo) {
        const found = lookupDemo(uid);
        if (!found) {
          res.sendStatus(404);
          return;
        }
        delete found.profile.avatar;
      } else {
        if (!validId(uid)) {
          res.sendStatus(404);
          return;
        }
        const result = await UserModel.updateOne(
          { _id: uid },
          { $unset: { avatarData: 1, avatarMime: 1, avatarUpdatedAt: 1 } },
        );
        if (!result.matchedCount) {
          res.sendStatus(404);
          return;
        }
      }
      res.sendStatus(204);
    }),
  );
}
