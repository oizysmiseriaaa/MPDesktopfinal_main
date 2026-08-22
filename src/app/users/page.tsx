"use client"

import { useState } from "react"
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, UserPlus, Mail, Phone, ExternalLink } from "lucide-react"

const MOCK_USERS = [
  { id: 1, name: "Alice Johnson", email: "alice@example.com", phone: "+1 (555) 123-4567", role: "Guest", bookings: 12, status: "Active", avatar: "https://picsum.photos/seed/user1/100/100" },
  { id: 2, name: "Mark Wilson", email: "mark.w@example.com", phone: "+1 (555) 987-6543", role: "Host", properties: 4, status: "Active", avatar: "https://picsum.photos/seed/user2/100/100" },
  { id: 3, name: "Sarah Connor", email: "sarah.c@sky.net", phone: "+1 (555) 000-1111", role: "Guest", bookings: 3, status: "Inactive", avatar: "https://picsum.photos/seed/user3/100/100" },
  { id: 4, name: "David Beckham", email: "david@goals.com", phone: "+1 (555) 222-3333", role: "Host", properties: 1, status: "Active", avatar: "https://picsum.photos/seed/user4/100/100" },
  { id: 5, name: "Elena Gilbert", email: "elena@mystic.com", phone: "+1 (555) 444-5555", role: "Guest", bookings: 8, status: "Active", avatar: "https://picsum.photos/seed/user5/100/100" },
]

export default function UsersPage() {
  const [searchTerm, setSearchTerm] = useState("")

  const filteredUsers = MOCK_USERS.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Directory preview only. User administration is not configured in this application.</p>
        </div>
        <Button className="gap-2" disabled title="User management is not configured">
          <UserPlus className="h-4 w-4" /> Add User unavailable
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Search users..." 
          className="pl-9"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="rounded-md border bg-card shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Activity</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback>{user.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="font-medium">{user.name}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col text-xs text-muted-foreground gap-1">
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3" /> {user.email}
                    </div>
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {user.phone}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-1 rounded-full ${user.role === 'Host' ? 'bg-primary/10 text-primary' : 'bg-accent/10 text-accent'}`}>
                    {user.role}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    {user.role === 'Host' ? `${user.properties} Properties` : `${user.bookings} Bookings`}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <div className={`h-2 w-2 rounded-full ${user.status === 'Active' ? 'bg-green-500' : 'bg-gray-400'}`} />
                    <span className="text-sm">{user.status}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" className="gap-2" disabled title="User profiles are not configured">
                    Profile unavailable <ExternalLink className="h-3 w-3" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
