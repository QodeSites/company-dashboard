// @ts-nocheck
"use client";

import React, { useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import InputField from "@/components/form/input/InputField";
import { Key } from "lucide-react";

export default function CreateUserPage() {
  const [formData, setFormData] = useState({
    user_name: "",
    email: "",
    contact_number: "",
    birth_date: "",
    birth_time: "",
    birth_location: "",
    mother_name: "",
    father_name: "",
    husband_name: "",
    nominees: "",
    emergency_contact_name: "",
    emergency_contact_number: "",
    aadhar: "",
    pan: "",
    residential_address: "",
    gender: "",
    occupation: "",
    password: ""
  });
  const [errors, setErrors] = useState<{
    user_name?: string;
    email?: string;
    password?: string;
    server?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const generatePassword = () => {
    const length = 12;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  };

  const handleGeneratePassword = () => {
    const newPassword = generatePassword();
    setFormData((prev) => ({ ...prev, password: newPassword }));
    setErrors((prev) => ({ ...prev, password: undefined, server: undefined }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined, server: undefined }));
  };

  const handleSelectGender = (value: string) => {
    setFormData((prev) => ({ ...prev, gender: value }));
  };

  const handleDateChange = (_: unknown, dateStr: string) => {
    setFormData((prev) => ({ ...prev, birth_date: dateStr }));
  };

  const validateForm = () => {
    const newErrors: { user_name?: string; email?: string; password?: string } = {};
    if (!formData.user_name.trim()) {
      newErrors.user_name = "Full Name is required";
    }
    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email format";
    }
    if (!formData.password.trim()) {
      newErrors.password = "Password is required";
    }
    setErrors((prev) => ({ ...prev, ...newErrors }));
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create user");
      }

      const result = await response.json();
      alert(
        `✅ User Created:\nICode: ${result.user.icode}\nEmail: ${result.user.email}\nPassword: ${result.user.password}`
      );
      setFormData({
        user_name: "",
        email: "",
        contact_number: "",
        birth_date: "",
        birth_time: "",
        birth_location: "",
        mother_name: "",
        father_name: "",
        husband_name: "",
        nominees: "",
        emergency_contact_name: "",
        emergency_contact_number: "",
        aadhar: "",
        pan: "",
        residential_address: "",
        gender: "",
        occupation: "",
        password: ""
      });
      setErrors({});
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "An unexpected error occurred";
      console.error("Error creating user:", error);
      setErrors((prev) => ({ ...prev, server: errorMessage }));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ComponentCard title="Create New User">
      <form onSubmit={handleSubmit} className="space-y-6">
        <InputField
          name="user_name"
          value={formData.user_name}
          onChange={handleChange}
          placeholder="Full Name"
          required
          error={!!errors.user_name}
          hint={errors.user_name}
        />
        <InputField
          name="email"
          type="email"
          value={formData.email}
          onChange={handleChange}
          placeholder="Email"
          required
          error={!!errors.email}
          hint={errors.email}
        />
        <div className="relative">
          <InputField
            name="password"
            type="text"
            value={formData.password}
            onChange={handleChange}
            placeholder="Password"
            required
            error={!!errors.password}
            hint={errors.password}
          />
          <button
            type="button"
            onClick={handleGeneratePassword}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
            title="Generate Password"
          >
            <Key size={20} />
          </button>
        </div>
        <InputField
          name="contact_number"
          value={formData.contact_number}
          onChange={handleChange}
          placeholder="Phone Number"
        />
        {/* 
        <DatePicker
          id="birth-date"
          label="Birth Date"
          placeholder="Select birth date"
          onChange={handleDateChange}
        />
        <InputField
          name="birth_time"
          type="time"
          value={formData.birth_time}
          onChange={handleChange}
          placeholder="Birth Time"
        />
        <InputField
          name="birth_location"
          value={formData.birth_location}
          onChange={handleChange}
          placeholder="Location of Birth"
        />
        <InputField
          name="mother_name"
          value={formData.mother_name}
          onChange={handleChange}
          placeholder="Mother's Name"
        />
        <InputField
          name="father_name"
          value={formData.father_name}
          onChange={handleChange}
          placeholder="Father's Name"
        />
        <InputField
          name="husband_name"
          value={formData.husband_name}
          onChange={handleChange}
          placeholder="Husband's Name (if any)"
        />
        <InputField
          name="nominees"
          value={formData.nominees}
          onChange={handleChange}
          placeholder="Nominees"
        />
        <InputField
          name="emergency_contact_name"
          value={formData.emergency_contact_name}
          onChange={handleChange}
          placeholder="Emergency Contact Name"
        />
        <InputField
          name="emergency_contact_number"
          value={formData.emergency_contact_number}
          onChange={handleChange}
          placeholder="Emergency Contact Number"
        />
        <InputField
          name="aadhar"
          value={formData.aadhar}
          onChange={handleChange}
          placeholder="Aadhar Number"
        />
        <InputField
          name="pan"
          value={formData.pan}
          onChange={handleChange}
          placeholder="PAN"
        />
        <InputField
          name="residential_address"
          value={formData.residential_address}
          onChange={handleChange}
          placeholder="Residential Address"
        />
        <Select
          options={[
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
            { value: "other", label: "Other" },
          ]}
          placeholder="Select Gender"
          onChange={(value) => handleSelectGender(value)}
        />
        <InputField
          name="occupation"
          value={formData.occupation}
          onChange={handleChange}
          placeholder="Occupation"
        /> */}
        {errors.server && (
          <p className="text-red-600 text-sm">{errors.server}</p>
        )}
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-blue-400"
          disabled={isSubmitting}
        >
          {isSubmitting ? "Creating..." : "Create User"}
        </button>
      </form>
    </ComponentCard>
  );
}