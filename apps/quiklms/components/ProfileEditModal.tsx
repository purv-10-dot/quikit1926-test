'use client';
/**
 * ProfileEditModal — ported from the old QuikSkills frontend
 * (src/components/ProfileEditModal.tsx).
 *
 * Modal for editing the current user's first/last name and profile picture:
 *   1. handleFileSelect — validates an image (type + 5MB cap), shows an instant
 *      object-URL preview, then multipart-uploads it through
 *      POST /api/auth/profile/upload-photo (which is a real multipart handler,
 *      not a presigned-PUT minter) and keeps the returned URL.
 *   2. handleSave — PATCH /api/auth/profile, then mirrors the updated user into
 *      sessionStorage and fires onSuccess/onClose.
 *
 * Email is rendered read-only.
 */
import React, { useState, useEffect, useRef } from 'react';
import { X, User, Camera } from 'lucide-react';
import { api } from '@/lib/api';

interface ProfileEditModalProps {
  user: {
    id?: string;
    _id?: string;
    firstName: string;
    lastName: string;
    email: string;
    profilePicture?: string;
    profilePictureUrl?: string;
  };
  onClose: () => void;
  onSuccess: () => void;
}

interface UploadPhotoResponse {
  success: boolean;
  data: {
    dataUrl?: string;
    permanentUrl?: string;
    url?: string;
    key?: string;
  };
}

interface UpdateProfileResponse {
  success: boolean;
  data: {
    firstName: string;
    lastName: string;
    profilePicture?: string;
    profilePictureUrl?: string;
  };
}

const ProfileEditModal: React.FC<ProfileEditModalProps> = ({
  user,
  onClose,
  onSuccess,
}) => {
  const [firstName, setFirstName] = useState(user.firstName || '');
  const [lastName, setLastName] = useState(user.lastName || '');
  const [profilePicture, setProfilePicture] = useState(user.profilePicture || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(user.profilePictureUrl || user.profilePicture || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFirstName(user.firstName || '');
    setLastName(user.lastName || '');
    setProfilePicture(user.profilePicture || '');
    setPreview(user.profilePictureUrl || user.profilePicture || null);
  }, [user]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Create instant local preview
      const localPreview = URL.createObjectURL(file);
      setPreview(localPreview);

      // Upload file through backend (avoids CORS/S3 permission issues)
      const formData = new FormData();
      formData.append('file', file);

      const uploadResponse = await api.post<UploadPhotoResponse>('/auth/profile/upload-photo', formData);

      const { dataUrl, permanentUrl, url: previewUrl } = uploadResponse.data;

      // Use base64 data URL if available (works without S3 GetObject permission)
      const displayUrl = dataUrl || previewUrl || localPreview;
      const storeUrl = dataUrl || permanentUrl;

      setProfilePicture(storeUrl || '');
      setPreview(displayUrl);
    } catch (err: unknown) {
      console.error('Failed to upload image:', err);
      setError((err as { message?: string })?.message || 'Failed to upload image. Please try again.');
      setPreview(user.profilePicture || null);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      console.log('Updating profile with:', { firstName, lastName, profilePicture });
      // Use PATCH for partial updates (more RESTful)
      const response = await api.patch<UpdateProfileResponse>('/auth/profile', {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        profilePicture: profilePicture || undefined,
      });
      console.log('Profile update response:', response);

      if (response.success) {
        // Update local storage with presigned URL for display
        const currentUser = JSON.parse(sessionStorage.getItem('user') || '{}');
        const updatedUser = {
          ...currentUser,
          firstName: response.data.firstName,
          lastName: response.data.lastName,
          profilePicture: response.data.profilePicture,
          profilePictureUrl: response.data.profilePictureUrl || response.data.profilePicture,
        };
        sessionStorage.setItem('user', JSON.stringify(updatedUser));

        onSuccess();
        onClose();
      }
    } catch (err: unknown) {
      console.error('Failed to update profile:', err);
      const e = err as { message?: string; statusCode?: number };
      const errorMessage = e?.message ||
                          (e?.statusCode === 404 ? 'Profile update endpoint not found. Please restart the backend server.' : 'Failed to update profile. Please try again.');
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6 border-b border-gray-200 pb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Edit Profile</h2>
            <p className="text-sm text-gray-500 mt-1">Update your profile information</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Profile Picture */}
        <div className="mb-6">
          <label className="text-sm font-medium text-gray-700 mb-2 block">Profile Picture</label>
          <div className="flex items-center gap-4">
            <div className="relative">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview}
                  alt="Profile"
                  className="w-24 h-24 rounded-full object-contain bg-white border-2 border-gray-200"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center border-2 border-gray-200">
                  <User className="w-12 h-12 text-primary-600" />
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                </div>
              )}
            </div>
            <div>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="btn-secondary flex items-center gap-2 disabled:opacity-50"
              >
                <Camera className="w-4 h-4" />
                {uploading ? 'Uploading...' : 'Change Photo'}
              </button>
              <p className="text-xs text-gray-500 mt-1">JPG, PNG or GIF (max 5MB)</p>
            </div>
          </div>
        </div>

        {/* First Name */}
        <div className="mb-4">
          <label htmlFor="firstName" className="label-field">
            First Name <span className="text-red-500">*</span>
          </label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="input-field"
            placeholder="Enter your first name"
            disabled={saving}
          />
        </div>

        {/* Last Name */}
        <div className="mb-4">
          <label htmlFor="lastName" className="label-field">
            Last Name <span className="text-red-500">*</span>
          </label>
          <input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="input-field"
            placeholder="Enter your last name"
            disabled={saving}
          />
        </div>

        {/* Email (read-only) */}
        <div className="mb-6">
          <label htmlFor="email" className="label-field">
            Email Address
          </label>
          <input
            id="email"
            type="email"
            value={user.email}
            className="input-field bg-gray-100 cursor-not-allowed"
            disabled
          />
          <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            onClick={onClose}
            className="btn-secondary"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !firstName.trim() || !lastName.trim()}
            className="btn-primary"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileEditModal;
