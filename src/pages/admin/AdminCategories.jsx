import { useEffect, useRef, useState } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { Plus, Edit, Trash2, Eye, EyeOff, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';

const createEmptyFormData = () => ({
  name: '',
  description: '',
  image: '',
  isActive: true,
  sortOrder: 0,
  promoSlides: []
});

const createLocalId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `promo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
};

const sanitizeStorageSegment = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizePromoSlides = (slides = []) =>
  (Array.isArray(slides) ? slides : [])
    .map((slide) => {
      if (typeof slide === 'string') {
        const url = slide.trim();
        if (!url) return null;
        return { url, alt: '', storagePath: '' };
      }

      const url = String(slide?.url || slide?.image || '').trim();
      if (!url) return null;

      return {
        url,
        alt: String(slide?.alt || slide?.title || '').trim(),
        storagePath: String(slide?.storagePath || slide?.path || '').trim()
      };
    })
    .filter(Boolean);

const getPromoSlideUrl = (slide) => String(slide?.url || slide?.image || '').trim();
const getPromoSlideKey = (slide, index) => slide?.storagePath || slide?.url || `promo-slide-${index}`;

const revokePreviewUrl = (item) => {
  if (item?.previewUrl) {
    URL.revokeObjectURL(item.previewUrl);
  }
};

export default function AdminCategories() {
  const { user } = useAuth();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [promoUrlInput, setPromoUrlInput] = useState('');
  const [promoSlideFiles, setPromoSlideFiles] = useState([]);
  const [formData, setFormData] = useState(createEmptyFormData);
  const promoSlideFilesRef = useRef([]);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    promoSlideFilesRef.current = promoSlideFiles;
  }, [promoSlideFiles]);

  useEffect(() => {
    return () => {
      promoSlideFilesRef.current.forEach(revokePreviewUrl);
    };
  }, []);

  const loadCategories = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'categories'));
      const categoriesData = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      setCategories(categoriesData.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
    } catch (error) {
      console.error('Error loading categories:', error);
      toast.error('Failed to load categories');
    } finally {
      setLoading(false);
    }
  };

  const clearQueuedPromoSlides = () => {
    promoSlideFilesRef.current.forEach(revokePreviewUrl);
    promoSlideFilesRef.current = [];
    setPromoSlideFiles([]);
  };

  const closeForm = () => {
    clearQueuedPromoSlides();
    setPromoUrlInput('');
    setFormData(createEmptyFormData());
    setEditingCategory(null);
    setShowForm(false);
  };

  const openCreateForm = () => {
    clearQueuedPromoSlides();
    setPromoUrlInput('');
    setFormData(createEmptyFormData());
    setEditingCategory(null);
    setShowForm(true);
  };

  const handleEdit = (category) => {
    clearQueuedPromoSlides();
    setEditingCategory(category);
    setPromoUrlInput('');
    setFormData({
      name: category.name || '',
      description: category.description || '',
      image: category.image || '',
      isActive: category.isActive !== false,
      sortOrder: category.sortOrder || 0,
      promoSlides: normalizePromoSlides(category.promoSlides)
    });
    setShowForm(true);
  };

  const uploadPromoSlide = async (file, categoryName, categoryId) => {
    if (!file) return null;

    if (!user) {
      toast.error('Please sign in to upload images');
      return null;
    }

    try {
      const folderName = sanitizeStorageSegment(categoryId || categoryName || 'category') || 'category';
      const fileName = `${Date.now()}-${sanitizeStorageSegment(file.name || 'promo-slide') || 'promo-slide'}`;
      const imageRef = storageRef(storage, `categories/${folderName}/promo/${fileName}`);
      const snapshot = await uploadBytes(imageRef, file);
      const url = await getDownloadURL(snapshot.ref);

      return {
        url,
        alt: `${categoryName || 'Category'} promotion`,
        storagePath: snapshot.ref.fullPath
      };
    } catch (error) {
      console.error('Error uploading promo image:', error);
      const message = String(error?.message || '').toLowerCase();

      if (message.includes('cors') || message.includes('preflight')) {
        toast.error('Upload blocked by CORS. Configure Storage CORS and try again.');
      } else if (error?.code === 'storage/unauthorized' || message.includes('unauthorized')) {
        toast.error('Not authorized to upload. Please sign in again.');
      } else {
        toast.error('Failed to upload promo image');
      }

      return null;
    }
  };

  const deletePromoSlidesFromStorage = async (slides = []) => {
    const removableSlides = normalizePromoSlides(slides).filter((slide) => slide.storagePath);
    if (removableSlides.length === 0) return;

    await Promise.allSettled(
      removableSlides.map((slide) => deleteObject(storageRef(storage, slide.storagePath)))
    );
  };

  const deleteRemovedPromoSlides = async (previousSlides = [], nextSlides = []) => {
    const previous = normalizePromoSlides(previousSlides);
    const next = normalizePromoSlides(nextSlides);

    const removedSlides = previous.filter((slide) => {
      const currentKey = slide.storagePath || slide.url;
      if (!currentKey) return false;

      return !next.some((nextSlide) => {
        if (slide.storagePath && nextSlide.storagePath) {
          return slide.storagePath === nextSlide.storagePath;
        }
        return slide.url === nextSlide.url;
      });
    });

    await deletePromoSlidesFromStorage(removedSlides);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      toast.error('Category name is required');
      return;
    }

    setSaving(true);
    const uploadToast =
      promoSlideFiles.length > 0
        ? toast.loading(
            `Uploading ${promoSlideFiles.length} promo image${promoSlideFiles.length > 1 ? 's' : ''}...`
          )
        : null;

    const uploadedSlides = [];
    let categorySaved = false;

    try {
      for (const queuedSlide of promoSlideFiles) {
        const uploadedSlide = await uploadPromoSlide(queuedSlide.file, trimmedName, editingCategory?.id);
        if (!uploadedSlide) {
          throw new Error('PROMO_UPLOAD_FAILED');
        }
        uploadedSlides.push(uploadedSlide);
      }

      const payload = {
        name: trimmedName,
        description: formData.description.trim(),
        image: formData.image.trim(),
        isActive: formData.isActive,
        sortOrder: parseInt(formData.sortOrder, 10) || 0,
        promoSlides: [...normalizePromoSlides(formData.promoSlides), ...uploadedSlides],
        updatedAt: new Date()
      };

      if (editingCategory) {
        await updateDoc(doc(db, 'categories', editingCategory.id), payload);
        categorySaved = true;
        try {
          await deleteRemovedPromoSlides(editingCategory.promoSlides, payload.promoSlides);
        } catch (cleanupError) {
          console.error('Error cleaning up removed promo slides:', cleanupError);
        }
        toast.success('Category updated successfully');
      } else {
        await addDoc(collection(db, 'categories'), {
          ...payload,
          createdAt: new Date()
        });
        categorySaved = true;
        toast.success('Category created successfully');
      }

      closeForm();
      loadCategories();
    } catch (error) {
      if (!categorySaved) {
        await deletePromoSlidesFromStorage(uploadedSlides);
      }
      console.error('Error saving category:', error);
      toast.error(
        error?.message === 'PROMO_UPLOAD_FAILED'
          ? 'Failed to upload one or more promo images'
          : 'Failed to save category'
      );
    } finally {
      if (uploadToast) {
        toast.dismiss(uploadToast);
      }
      setSaving(false);
    }
  };

  const handleDelete = async (category) => {
    if (!confirm(`Are you sure you want to delete "${category.name}"?`)) return;

    try {
      await deleteDoc(doc(db, 'categories', category.id));
      deletePromoSlidesFromStorage(category.promoSlides).catch((cleanupError) => {
        console.error('Error deleting promo slides from storage:', cleanupError);
      });
      toast.success('Category deleted successfully');
      loadCategories();
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Failed to delete category');
    }
  };

  const toggleVisibility = async (category) => {
    const nextIsActive = category.isActive === false;

    try {
      await updateDoc(doc(db, 'categories', category.id), {
        isActive: nextIsActive
      });
      toast.success(`Category ${nextIsActive ? 'shown' : 'hidden'} on homepage`);
      loadCategories();
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error('Failed to update category');
    }
  };

  const handlePromoFileSelection = (event) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';

    if (selectedFiles.length === 0) return;

    const validFiles = [];

    selectedFiles.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} is not an image`);
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} is larger than 5MB`);
        return;
      }

      validFiles.push({
        id: createLocalId(),
        file,
        previewUrl: URL.createObjectURL(file)
      });
    });

    if (validFiles.length === 0) return;

    setPromoSlideFiles((current) => [...current, ...validFiles]);
    toast.success(
      `${validFiles.length} promo image${validFiles.length > 1 ? 's' : ''} added to the queue`
    );
  };

  const handleRemoveQueuedPromoSlide = (slideId) => {
    setPromoSlideFiles((current) => {
      const target = current.find((slide) => slide.id === slideId);
      if (target) revokePreviewUrl(target);
      return current.filter((slide) => slide.id !== slideId);
    });
  };

  const handleRemoveSavedPromoSlide = (slideIndex) => {
    setFormData((current) => ({
      ...current,
      promoSlides: current.promoSlides.filter((_, index) => index !== slideIndex)
    }));
  };

  const handleAddPromoUrl = () => {
    const trimmedUrl = promoUrlInput.trim();
    if (!trimmedUrl) return;

    try {
      new URL(trimmedUrl);
    } catch (error) {
      toast.error('Please enter a valid image URL');
      return;
    }

    setFormData((current) => ({
      ...current,
      promoSlides: [
        ...current.promoSlides,
        {
          url: trimmedUrl,
          alt: `${current.name.trim() || 'Category'} promotion`,
          storagePath: ''
        }
      ]
    }));
    setPromoUrlInput('');
  };

  const savedPromoSlides = normalizePromoSlides(formData.promoSlides);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Category Management</h1>
            <p className="text-gray-600 mt-1">Manage homepage categories and their display order</p>
          </div>
          <button
            onClick={openCreateForm}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus size={20} />
            Add Category
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">
              {editingCategory ? 'Edit Category' : 'Add New Category'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Sort Order
                  </label>
                  <input
                    type="number"
                    value={formData.sortOrder}
                    onChange={(e) =>
                      setFormData({ ...formData, sortOrder: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Image URL
                </label>
                <input
                  type="url"
                  value={formData.image}
                  onChange={(e) => setFormData({ ...formData, image: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="https://example.com/image.jpg"
                />
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Homepage Promo Slideshow
                    </label>
                    <p className="mt-1 text-sm text-gray-500">
                      Add images for this category. They will appear above the category products on
                      the homepage. Leave this empty to keep the homepage unchanged.
                    </p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                    <Upload size={16} />
                    Upload images
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handlePromoFileSelection}
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="url"
                    value={promoUrlInput}
                    onChange={(e) => setPromoUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddPromoUrl();
                      }
                    }}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Paste a promo image URL"
                  />
                  <button
                    type="button"
                    onClick={handleAddPromoUrl}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Add URL
                  </button>
                </div>

                {savedPromoSlides.length === 0 && promoSlideFiles.length === 0 ? (
                  <p className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-500">
                    No promo slides added. The category section on the homepage will stay the same.
                  </p>
                ) : (
                  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {savedPromoSlides.map((slide, index) => (
                      <div
                        key={getPromoSlideKey(slide, index)}
                        className="overflow-hidden rounded-xl border border-gray-200 bg-white"
                      >
                        <div className="relative h-36">
                          <img
                            src={getPromoSlideUrl(slide)}
                            alt={slide.alt || ''}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveSavedPromoSlide(index)}
                            className="absolute right-2 top-2 rounded-full bg-black/65 p-1.5 text-white hover:bg-black/80"
                            aria-label={`Remove saved promo slide ${index + 1}`}
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between px-3 py-2 text-xs">
                          <span className="font-medium text-blue-600">Saved slide</span>
                          <span className="text-gray-500">Homepage ready</span>
                        </div>
                      </div>
                    ))}

                    {promoSlideFiles.map((slide) => (
                      <div
                        key={slide.id}
                        className="overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50"
                      >
                        <div className="relative h-36">
                          <img
                            src={slide.previewUrl}
                            alt={slide.file.name}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveQueuedPromoSlide(slide.id)}
                            className="absolute right-2 top-2 rounded-full bg-black/65 p-1.5 text-white hover:bg-black/80"
                            aria-label={`Remove queued promo slide ${slide.file.name}`}
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="flex items-center justify-between px-3 py-2 text-xs">
                          <span className="font-medium text-emerald-700">Queued upload</span>
                          <span className="max-w-[11rem] truncate text-emerald-700">
                            {slide.file.name}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                  Show on homepage
                </label>
              </div>

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
                >
                  {saving
                    ? editingCategory
                      ? 'Updating...'
                      : 'Creating...'
                    : editingCategory
                    ? 'Update Category'
                    : 'Create Category'}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  disabled={saving}
                  className="bg-gray-200 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Category</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Description</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Order</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Status</th>
                  <th className="text-left py-4 px-6 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    </td>
                  </tr>
                ) : categories.length > 0 ? (
                  categories.map((category) => {
                    const promoSlideCount = normalizePromoSlides(category.promoSlides).length;

                    return (
                      <tr key={category.id} className="hover:bg-gray-50">
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            {category.image && (
                              <img
                                src={category.image}
                                alt=""
                                className="w-10 h-10 rounded object-cover"
                              />
                            )}
                            <div>
                              <p className="font-semibold text-gray-900">{category.name}</p>
                              {promoSlideCount > 0 && (
                                <p className="text-xs font-medium text-blue-600 mt-1">
                                  {promoSlideCount} promo slide
                                  {promoSlideCount === 1 ? '' : 's'}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <p className="text-gray-600 text-sm max-w-xs truncate">
                            {category.description || 'No description'}
                          </p>
                        </td>
                        <td className="py-4 px-6">
                          <span className="px-2 py-1 bg-gray-100 rounded text-sm">
                            {category.sortOrder || 0}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              category.isActive !== false
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {category.isActive !== false ? 'Visible' : 'Hidden'}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex gap-2">
                            <button
                              onClick={() => toggleVisibility(category)}
                              className={`p-2 rounded ${
                                category.isActive !== false
                                  ? 'text-red-600 hover:bg-red-50'
                                  : 'text-green-600 hover:bg-green-50'
                              }`}
                              title={
                                category.isActive !== false
                                  ? 'Hide from homepage'
                                  : 'Show on homepage'
                              }
                            >
                              {category.isActive !== false ? (
                                <EyeOff size={16} />
                              ) : (
                                <Eye size={16} />
                              )}
                            </button>
                            <button
                              onClick={() => handleEdit(category)}
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                              title="Edit category"
                            >
                              <Edit size={16} />
                            </button>
                            <button
                              onClick={() => handleDelete(category)}
                              className="p-2 text-red-600 hover:bg-red-50 rounded"
                              title="Delete category"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="5" className="py-12 text-center">
                      <div className="flex flex-col items-center justify-center">
                        <Plus size={48} className="text-gray-400 mb-3" />
                        <p className="text-gray-500 font-medium">No categories yet</p>
                        <p className="text-gray-400 text-sm">Add your first category to get started</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
