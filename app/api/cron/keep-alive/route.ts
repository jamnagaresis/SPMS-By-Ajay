import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization')

    // Optional: Check for Vercel Cron secret if you want to secure it
    // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    //   return new Response('Unauthorized', { status: 401 })
    // }

    try {
        const supabaseStr = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

        if (!supabaseStr || !supabaseKey) {
            throw new Error('Supabase environment variables are missing')
        }

        const supabase = createClient(supabaseStr, supabaseKey)

        // Perform a very light query to keep the database active
        // We check the 'profiles' table which is usually present
        const { data, error } = await supabase
            .from('profiles')
            .select('id')
            .limit(1)

        if (error) {
            console.error('Supabase Ping Error:', error)
            return NextResponse.json({
                success: false,
                message: 'Database query failed',
                error: error.message
            }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            message: 'Supabase project kept alive successfully',
            timestamp: new Date().toISOString()
        })
    } catch (err: any) {
        console.error('Keep-Alive Route Error:', err)
        return NextResponse.json({
            success: false,
            error: err.message
        }, { status: 500 })
    }
}
