// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
"use client";

import React, { useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import InputField from "@/components/form/input/InputField";
import DatePicker from "@/components/form/date-picker";
import Select from "@/components/form/Select";

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
    occupation: ""
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectGender = (value: string) => {
    setFormData(prev => ({ ...prev, gender: value }));
  };

  const handleDateChange = (_: unknown, dateStr: string) => {
    setFormData(prev => ({ ...prev, birth_date: dateStr }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const result = await response.json();
      alert(`✅ User Created: ${result.user.icode}`);
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
        occupation: ""
      });
    } catch (error) {
      console.error("Error creating user:", error);
      alert("❌ Failed to create user.");
    }
  };

  return (
    <ComponentCard title="Create New User (All Fields)">
      <form onSubmit={handleSubmit} className="space-y-6">
        <InputField name="user_name" value={formData.user_name} onChange={handleChange} placeholder="Full Name" />
        <InputField name="email" type="email" value={formData.email} onChange={handleChange} placeholder="Email" />
        <InputField name="contact_number" value={formData.contact_number} onChange={handleChange} placeholder="Phone Number" />

        <DatePicker
          id="birth-date"
          label="Birth Date"
          placeholder="Select birth date"
          onChange={handleDateChange}
        />

        <InputField name="birth_time" type="time" value={formData.birth_time} onChange={handleChange} placeholder="Birth Time" />
        <InputField name="birth_location" value={formData.birth_location} onChange={handleChange} placeholder="Location of Birth" />
        <InputField name="mother_name" value={formData.mother_name} onChange={handleChange} placeholder="Mother's Name" />
        <InputField name="father_name" value={formData.father_name} onChange={handleChange} placeholder="Father's Name" />
        <InputField name="husband_name" value={formData.husband_name} onChange={handleChange} placeholder="Husband's Name (if any)" />
        <InputField name="nominees" value={formData.nominees} onChange={handleChange} placeholder="Nominees" />
        <InputField name="emergency_contact_name" value={formData.emergency_contact_name} onChange={handleChange} placeholder="Emergency Contact Name" />
        <InputField name="emergency_contact_number" value={formData.emergency_contact_number} onChange={handleChange} placeholder="Emergency Contact Number" />
        <InputField name="aadhar" value={formData.aadhar} onChange={handleChange} placeholder="Aadhar Number" />
        <InputField name="pan" value={formData.pan} onChange={handleChange} placeholder="PAN" />
        <InputField name="residential_address" value={formData.residential_address} onChange={handleChange} placeholder="Residential Address" />

        <Select
          options={[
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
            { value: "other", label: "Other" }
          ]}
          placeholder="Select Gender"
          onChange={(value) => handleSelectGender(value)}
        />

        <InputField name="occupation" value={formData.occupation} onChange={handleChange} placeholder="Occupation" />

        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Create User
        </button>
      </form>
    </ComponentCard>
  );
}
