'use client';

import { useState, useEffect, useRef } from 'react';
import {
  User,
  Key,
  Save,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Upload,
  Lock,
  Bell,
  Globe,
  Moon,
  Sun,
  Shield,
  Clock,
  Camera,
  RefreshCw,
  Monitor,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useBranding } from '@/app/providers';
import toast, { Toaster } from 'react-hot-toast';

export default function ProfileSettingsPage() {
  const { branding } = useBranding();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [profilePicture, setProfilePicture] = useState<string>('');
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState<string | null>(null);

  // Security Settings
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Notification Preferences
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [courseAssignmentNotif, setCourseAssignmentNotif] = useState(true);
  const [completionNotif, setCompletionNotif] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);

  // Appearance Settings
  const [timezone, setTimezone] = useState('UTC');

  // Active tab
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications' | 'appearance'>('profile');

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const response = await api.get<any>('/auth/profile');
      const profileData = response.data?.data || response.data || {};

      setUser(profileData);
      setFirstName(profileData.firstName || '');
      setLastName(profileData.lastName || '');
      setEmail(profileData.email || '');
      setProfilePicture(profileData.profilePictureUrl || profileData.profilePicture || '');

      const savedTimezone = profileData.timezone || localStorage.getItem('timezone') || 'Asia/Kolkata';
      setTimezone(savedTimezone);

      // Load notification prefs from localStorage
      const storedEmailNotif = localStorage.getItem('emailNotifications');
      const storedCourseNotif = localStorage.getItem('courseAssignmentNotif');
      const storedCompletionNotif = localStorage.getItem('completionNotif');
      const storedWeeklyDigest = localStorage.getItem('weeklyDigest');
      if (storedEmailNotif !== null) setEmailNotifications(storedEmailNotif === 'true');
      if (storedCourseNotif !== null) setCourseAssignmentNotif(storedCourseNotif === 'true');
      if (storedCompletionNotif !== null) setCompletionNotif(storedCompletionNotif === 'true');
      if (storedWeeklyDigest !== null) setWeeklyDigest(storedWeeklyDigest === 'true');
    } catch (err: any) {
      console.error('Failed to load profile:', err);
      // Graceful fallback — 404 in mock auth is expected
      if (err?.status !== 404) {
        setError('Failed to load profile');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleProfilePictureSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('Image size must be less than 5MB');
        return;
      }
      setProfilePictureFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePicturePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveProfilePicture = () => {
    setProfilePictureFile(null);
    setProfilePicturePreview(null);
    setProfilePicture('');
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      let pictureUrl = profilePicture;

      // Upload profile picture if changed
      if (profilePictureFile) {
        try {
          const formData = new FormData();
          formData.append('file', profilePictureFile);
          const uploadResponse = await api.post<any>('/auth/profile/upload-photo', formData);
          pictureUrl = uploadResponse.data?.data?.permanentUrl || uploadResponse.data?.data?.url || pictureUrl;
          setProfilePicture(uploadResponse.data?.data?.url || pictureUrl);
        } catch (uploadError: any) {
          console.error('Failed to upload profile picture:', uploadError);
          setError('Failed to upload profile picture');
          setSaving(false);
          return;
        }
      }

      const updates: any = {
        firstName,
        lastName,
      };

      if (profilePictureFile) {
        updates.profilePicture = pictureUrl;
      }

      await api.patch<any>('/auth/profile', updates);

      // Update sessionStorage
      const updatedUser = {
        ...user,
        firstName,
        lastName,
        profilePicture: pictureUrl,
        profilePictureUrl: profilePicture,
      };
      sessionStorage.setItem('user', JSON.stringify(updatedUser));

      setSuccess('Profile updated successfully!');
      setProfilePictureFile(null);
      setProfilePicturePreview(null);
      setProfilePicture(pictureUrl);

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      setError(err?.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await api.post<any>('/auth/change-password', {
        currentPassword,
        newPassword,
      });

      setSuccess('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Failed to change password:', err);
      setError(err?.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await api.patch<any>('/auth/profile', {
        timezone,
      });

      localStorage.setItem('timezone', timezone);
      localStorage.setItem('emailNotifications', emailNotifications.toString());
      localStorage.setItem('courseAssignmentNotif', courseAssignmentNotif.toString());
      localStorage.setItem('completionNotif', completionNotif.toString());
      localStorage.setItem('weeklyDigest', weeklyDigest.toString());

      setSuccess('Preferences saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error('Failed to save preferences:', err);
      setError(err?.message || 'Failed to save preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'security' as const, label: 'Security', icon: Lock },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'appearance' as const, label: 'Appearance', icon: Globe },
  ];

  const primaryColor = branding?.primaryColor || '#4f46e5';
  const secondaryColor = branding?.secondaryColor || '#ec4899';

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 space-y-4 sm:space-y-6 lg:space-y-8 pb-12">
      <Toaster position="top-right" />

      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white transition-all duration-500 mt-4 sm:mt-6 lg:mt-8 mb-6"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
      >
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        ></div>
        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
              <User className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Profile Settings</h1>
              <p className="text-white/80 text-sm sm:text-base lg:text-lg font-light mt-1">Manage your account settings and preferences</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div className="flex overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors border-b-2 whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-center gap-3 mb-6">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
          <p className="text-green-800 dark:text-green-200">{success}</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3 mb-6">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
          <p className="text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Profile Information</h2>

            {/* Profile Picture */}
            <div className="mb-6">
              <label className="label-field">Profile Picture</label>
              <div className="flex items-center gap-4">
                <div className="relative">
                  {profilePicturePreview || profilePicture ? (
                    <img
                      src={profilePicturePreview || profilePicture}
                      alt="Profile"
                      className="w-24 h-24 rounded-full object-contain bg-white border-4 border-gray-200 dark:border-gray-600"
                    />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                      <User className="w-12 h-12 text-primary-600 dark:text-primary-400" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute bottom-0 right-0 p-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 transition-colors"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleProfilePictureSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-secondary text-sm mb-2"
                  >
                    <Upload className="w-4 h-4 inline mr-2" />
                    Upload Photo
                  </button>
                  {(profilePicture || profilePicturePreview) && (
                    <button
                      type="button"
                      onClick={handleRemoveProfilePicture}
                      className="block text-sm text-red-600 hover:text-red-700"
                    >
                      Remove Photo
                    </button>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">JPG, PNG or GIF (max 5MB)</p>
                </div>
              </div>
            </div>

            {/* Name Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="label-field">First Name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="input-field"
                  placeholder="First Name"
                />
              </div>
              <div>
                <label className="label-field">Last Name</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="input-field"
                  placeholder="Last Name"
                />
              </div>
            </div>

            {/* Email */}
            <div className="mb-4">
              <label className="label-field">Email</label>
              <input
                type="email"
                value={email}
                disabled
                className="input-field bg-gray-50 dark:bg-gray-700 cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Email cannot be changed</p>
            </div>

            {/* Role */}
            <div className="mb-6">
              <label className="label-field">Role</label>
              <div className="px-4 py-2 bg-primary-50 dark:bg-primary-900/30 border border-primary-200 dark:border-primary-800 rounded-lg inline-flex items-center">
                <span className="font-medium text-primary-700 dark:text-primary-300">{user?.role}</span>
              </div>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={saving}
              className="btn-primary flex items-center gap-2"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Changes
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Change Password</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Ensure your account is using a strong password</p>

            <div className="space-y-4 max-w-md">
              <div>
                <label className="label-field">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="input-field pr-10"
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="label-field">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input-field pr-10"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Minimum 8 characters</p>
              </div>

              <div>
                <label className="label-field">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field pr-10"
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                onClick={handleChangePassword}
                disabled={saving}
                className="btn-primary flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Lock className="w-5 h-5" />
                    Update Password
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Account Security</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <Shield className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">Two-Factor Authentication</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Add an extra layer of security</p>
                  </div>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Coming Soon</span>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">Active Sessions</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Manage your active sessions</p>
                  </div>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">Coming Soon</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Tab */}
      {activeTab === 'notifications' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Notification Preferences</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Manage how you receive notifications</p>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">Email Notifications</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Receive email updates</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={emailNotifications}
                    onChange={(e) => setEmailNotifications(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">Course Assignments</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Get notified when courses are assigned</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={courseAssignmentNotif}
                    onChange={(e) => setCourseAssignmentNotif(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">Completion Notifications</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Notifications for course completions</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={completionNotif}
                    onChange={(e) => setCompletionNotif(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100">Weekly Digest</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Receive weekly activity summary</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={weeklyDigest}
                    onChange={(e) => setWeeklyDigest(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 dark:peer-focus:ring-primary-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>
            </div>

            <button
              onClick={handleSavePreferences}
              disabled={saving}
              className="btn-primary flex items-center gap-2 mt-6"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Preferences
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Appearance Tab */}
      {activeTab === 'appearance' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Appearance Settings</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Customize your interface preferences</p>

            <div className="space-y-6">
              {/* Timezone Selection */}
              <div>
                <label className="label-field">Timezone</label>
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="input-field max-w-xs"
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time (ET)</option>
                  <option value="America/Chicago">Central Time (CT)</option>
                  <option value="America/Denver">Mountain Time (MT)</option>
                  <option value="America/Los_Angeles">Pacific Time (PT)</option>
                  <option value="Europe/London">London (GMT)</option>
                  <option value="Europe/Paris">Paris (CET)</option>
                  <option value="Asia/Tokyo">Tokyo (JST)</option>
                  <option value="Asia/Kolkata">India (IST)</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleSavePreferences}
              disabled={saving}
              className="btn-primary flex items-center gap-2 mt-6"
            >
              {saving ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Save Preferences
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
