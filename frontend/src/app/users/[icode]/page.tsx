// @ts-nocheck
"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import { Table, TableHeader, TableRow, TableCell, TableBody } from "@/components/ui/table";
import { formatIndianCurrency } from "@/utils/currencyFormat";
import Spinner from "@/components/spinners/Spinner";
import InputField from "@/components/form/input/InputField";
import { Key } from "lucide-react";

interface Allocation {
  qcode: string;
  account_name: string;
  allocation_percent: string;
  contribution_amount: string;
  allocation_date: string;
}

interface User {
  icode: string;
  user_name: string;
  email: string;
  password: string;
  contact_number: string;
  created_at: string;
  birth_date: string;
  birth_time: string;
  birth_location: string;
  mother_name: string;
  father_name: string;
  husband_name: string;
  nominees: string;
  emergency_contact_name: string;
  emergency_contact_number: string;
  aadhar: string;
  pan: string;
  residential_address: string;
  gender: string;
  occupation: string;
}

export default function UserDetailsPage() {
  const { icode } = useParams();
  const [user, setUser] = useState<User | null>(null);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<User | null>(null);
  const [formErrors, setFormErrors] = useState<{
    user_name?: string;
    email?: string;
    password?: string;
    server?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setIsLoading(true);
        setError(null);
        console.log("Fetching user details for icode:", icode);
        const [userRes, allocRes] = await Promise.all([
          fetch(`/api/users?icode=${icode}`),
          fetch(`/api/users/${icode}/allocations`),
        ]);

        if (!userRes.ok) {
          const errorText = await userRes.text();
          throw new Error(`Failed to fetch user data: ${userRes.status} ${errorText}`);
        }
        if (!allocRes.ok) {
          throw new Error("Failed to fetch allocations");
        }

        const userData = await userRes.json();
        const allocData = await allocRes.json();

        console.log("User data received:", userData);
        setUser(userData);
        setFormData(userData);
        setAllocations(allocData);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
        console.error("Failed to fetch user details:", error);
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    };

    if (icode) {
      fetchDetails();
    }
  }, [icode]);

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
    const newPassword = generatePassword(); // Fixed: Call the function
    console.log("Generated password:", newPassword); // Debug log
    setFormData((prev) => {
      if (!prev) {
        console.warn("formData is null, cannot update password");
        return prev;
      }
      return { ...prev, password: newPassword };
    });
    setFormErrors((prev) => ({ ...prev, password: undefined, server: undefined })); // Fixed syntax
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => (prev ? { ...prev, [name]: value } : prev));
    setFormErrors((prev) => ({ ...prev, [name]: undefined, server: undefined }));
  };

  const handleSelectGender = (value: string) => {
    setFormData((prev) => (prev ? { ...prev, gender: value } : prev));
  };

  const handleDateChange = (_: unknown, dateStr: string) => {
    setFormData((prev) => (prev ? { ...prev, birth_date: dateStr } : prev));
  };

  const validateForm = () => {
    const newErrors: { user_name?: string; email?: string; password?: string } = {};
    if (!formData?.user_name.trim()) {
      newErrors.user_name = "Full Name is required";
    }
    if (!formData?.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Invalid email format";
    }
    if (!formData?.password.trim()) {
      newErrors.password = "Password is required";
    }
    setFormErrors((prev) => ({ ...prev, ...newErrors }));
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData || !validateForm()) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/users?icode=${icode}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to update user");
      }

      const updatedUser = await response.json();
      setUser(updatedUser);
      setFormData(updatedUser);
      setIsEditing(false);
      alert("✅ User updated successfully!");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
      console.error("Error updating user:", error);
      setFormErrors((prev) => ({ ...prev, server: errorMessage }));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Spinner />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="text-center text-red-600 dark:text-red-400 p-6 bg-red-50 dark:bg-red-900/10 rounded-lg">
        {error || "User not found"}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <ComponentCard title={`User Details - ${user.user_name || "Unknown User"}`}>
        {isEditing ? (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <InputField
              name="user_name"
              value={formData?.user_name || ""}
              onChange={handleChange}
              placeholder="Full Name"
              required
              error={!!formErrors.user_name}
              hint={formErrors.user_name}
              className="w-full"
            />
            <InputField
              name="email"
              type="email"
              value={formData?.email || ""}
              onChange={handleChange}
              placeholder="Email"
              required
              error={!!formErrors.email}
              hint={formErrors.email}
              className="w-full"
            />
            <div className="relative">
              <InputField
                name="password"
                type="text"
                value={formData?.password || ""}
                onChange={handleChange}
                placeholder="Password"
                required
                error={!!formErrors.password}
                hint={formErrors.password}
                className="w-full"
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
              value={formData?.contact_number || ""}
              onChange={handleChange}
              placeholder="Phone Number"
              className="w-full"
            />
            {/* <InputField
              name="birth_date"
              type="date"
              value={formData?.birth_date || ""}
              onChange={handleChange}
              placeholder="Birth Date"
            />
            <InputField
              name="birth_time"
              type="time"
              value={formData?.birth_time || ""}
              onChange={handleChange}
              placeholder="Birth Time"
            />
            <InputField
              name="birth_location"
              value={formData?.birth_location || ""}
              onChange={handleChange}
              placeholder="Location of Birth"
            />
            <InputField
              name="mother_name"
              value={formData?.mother_name || ""}
              onChange={handleChange}
              placeholder="Mother's Name"
            />
            <InputField
              name="father_name"
              value={formData?.father_name || ""}
              onChange={handleChange}
              placeholder="Father's Name"
            />
            <InputField
              name="husband_name"
              value={formData?.husband_name || ""}
              onChange={handleChange}
              placeholder="Husband's Name (if any)"
            />
            <InputField
              name="nominees"
              value={formData?.nominees || ""}
              onChange={handleChange}
              placeholder="Nominees"
            />
            <InputField
              name="emergency_contact_name"
              value={formData?.emergency_contact_name || ""}
              onChange={handleChange}
              placeholder="Emergency Contact Name"
            />
            <InputField
              name="emergency_contact_number"
              value={formData?.emergency_contact_number || ""}
              onChange={handleChange}
              placeholder="Emergency Contact Number"
            />
            <InputField
              name="aadhar"
              value={formData?.aadhar || ""}
              onChange={handleChange}
              placeholder="Aadhar Number"
            />
            <InputField
              name="pan"
              value={formData?.pan || ""}
              onChange={handleChange}
              placeholder="PAN"
            />
            <InputField
              name="residential_address"
              value={formData?.residential_address || ""}
              onChange={handleChange}
              placeholder="Residential Address"
            /> */}
            <select
              name="gender"
              value={formData?.gender || ""}
              onChange={(e) => handleSelectGender(e.target.value)}
              className="w-full p-2 border rounded bg-white dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
            >
              <option value="">Select Gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
            {/* <InputField
              name="occupation"
              value={formData?.occupation || ""}
              onChange={handleChange}
              placeholder="Occupation"
            /> */}
            {formErrors.server && (
              <p className="text-red-600 text-sm col-span-full">{formErrors.server}</p>
            )}
            <div className="col-span-full flex space-x-4">
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:bg-blue-400"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Updating..." : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="bg-gray-300 text-gray-800 px-4 py-2 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">ICode</span>
              <span className="text-base text-gray-900 dark:text-white">{user.icode || "N/A"}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</span>
              <span className="text-base text-gray-900 dark:text-white">{user.user_name || "N/A"}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</span>
              <span className="text-base text-gray-900 dark:text-white">{user.email || "N/A"}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Password</span>
              <span className="text-base text-gray-900 dark:text-white">{user.password || "N/A"}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Contact Number</span>
              <span className="text-base text-gray-900 dark:text-white">{user.contact_number || "N/A"}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Created On</span>
              <span className="text-base text-gray-900 dark:text-white">
                {user.created_at ? new Date(user.created_at).toLocaleDateString() : "N/A"}
              </span>
            </div>
            {/* <p className="text-sm text-gray-600 dark:text-gray-400">Birth Date: {user.birth_date || "N/A"}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Birth Time: {user.birth_time || "N/A"}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Birth Location: {user.birth_location || "N/A"}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Mother's Name: {user.mother_name || "N/A"}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Father's Name: {user.father_name || "N/A"}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Husband's Name: {user.husband_name || "N/A"}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Nominees: {user.nominees || "N/A"}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Emergency Contact Name: {user.emergency_contact_name || "N/A"}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Emergency Contact Number: {user.emergency_contact_number || "N/A"}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Aadhar: {user.aadhar || "N/A"}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">PAN: {user.pan || "N/A"}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Residential Address: {user.residential_address || "N/A"}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Gender: {user.gender || "N/A"}</p>
            <p className="text-sm text-gray-600 dark:text-gray-400">Occupation: {user.occupation || "N/A"}</p> */}
            <div className="col-span-full">
              <button
                onClick={() => setIsEditing(true)}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
              >
                Edit User
              </button>
            </div>
          </div>
        )}
      </ComponentCard>

      <ComponentCard title="Pooled Account Allocations">
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
          <div className="max-w-full overflow-x-auto">
            <div className="min-w-[640px]">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                  <TableRow>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400"
                    >
                      Account
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400"
                    >
                      Date
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400"
                    >
                      Amount (₹)
                    </TableCell>
                    <TableCell
                      isHeader
                      className="px-5 py-3 text-start text-theme-xs text-gray-500 font-medium dark:text-gray-400"
                    >
                      Allocation (%)
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                  {allocations.length > 0 ? (
                    allocations.map((a, i) => (
                      <TableRow key={i}>
                        <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">
                          {a.account_name} ({a.qcode})
                        </TableCell>
                        <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">
                          {a.allocation_date}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">
                          {formatIndianCurrency(a.contribution_amount)}
                        </TableCell>
                        <TableCell className="px-5 py-4 text-theme-sm text-gray-700 dark:text-white/90">
                          {a.allocation_percent}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell
                        className="px-5 py-4 text-center text-theme-sm text-gray-700 dark:text-white/90"
                      >
                        No allocations found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </ComponentCard>
    </div>
  );
}