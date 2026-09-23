import { Schema, model, models, type Model, type Types } from 'mongoose';

/**
 * Mirrors Better Auth's `user` collection.
 *
 * The auth library owns credential fields (the password hash lives in
 * `account`), so this schema deliberately declares no password column. The
 * explicit `collection` name is required: Mongoose would otherwise pluralise to
 * `users` and read an empty collection.
 */
export type UserPlan = 'FREE' | 'PRO' | 'TEAM';

export type UserDocument = {
  _id: Types.ObjectId;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  plan: UserPlan;
  createdAt: Date;
  updatedAt: Date;
};

const userSchema = new Schema<UserDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, lowercase: true, trim: true },
    emailVerified: { type: Boolean, default: false },
    image: { type: String, default: null },
    plan: { type: String, enum: ['FREE', 'PRO', 'TEAM'], default: 'FREE' },
  },
  {
    collection: 'user',
    timestamps: true,
    versionKey: false,
  },
);

userSchema.index({ email: 1 }, { unique: true, name: 'user_email_unique' });

export const User: Model<UserDocument> =
  (models.User as Model<UserDocument>) ?? model<UserDocument>('User', userSchema);
