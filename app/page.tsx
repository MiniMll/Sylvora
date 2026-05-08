import { redirect } from 'next/navigation'
import { DollarSign, Receipt, Hash } from 'lucide-react'

export default function Home() {
  redirect('/dashboard')
}