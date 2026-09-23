import { Schema, model, models, type Model, type Types } from 'mongoose';

export const TEMPLATE_CATEGORIES = [
  'Business',
  'Student',
  'Freelancer',
  'Marketing',
  'Development',
  'HR',
  'Personal',
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

export type TemplateDocument = {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description: string;
  category: TemplateCategory;
  /** Built-in templates ship with the app; user templates are workspace-scoped. */
  isSystem: boolean;
  workspaceId: Types.ObjectId | null;
  createdBy: Types.ObjectId | null;
  nodes: unknown[];
  edges: unknown[];
  tags: string[];
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
};

const templateSchema = new Schema<TemplateDocument>(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    description: { type: String, required: true, maxlength: 1000 },
    category: { type: String, enum: TEMPLATE_CATEGORIES, required: true },
    isSystem: { type: Boolean, default: false },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    nodes: { type: [Schema.Types.Mixed], default: [] },
    edges: { type: [Schema.Types.Mixed], default: [] },
    tags: { type: [String], default: [] },
    usageCount: { type: Number, default: 0 },
  },
  { timestamps: true, versionKey: false },
);

templateSchema.index({ slug: 1 }, { unique: true, name: 'template_slug_unique' });
templateSchema.index({ category: 1, isSystem: 1 }, { name: 'template_category_system' });
templateSchema.index(
  { name: 'text', description: 'text', tags: 'text' },
  { name: 'template_text_search', weights: { name: 5, tags: 3, description: 1 } },
);

export const Template: Model<TemplateDocument> =
  (models.Template as Model<TemplateDocument>) ??
  model<TemplateDocument>('Template', templateSchema);
