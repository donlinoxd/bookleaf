import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTRPC, getTRPCErrorMessage } from '@/lib/trpc';
import { useAuthStore } from '@/store/useAuthStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const schema = z.object({
  idNumber: z.string().min(1, 'ID is required'),
  pin: z.string().min(1, 'PIN is required'),
});
type FormData = z.infer<typeof schema>;

export default function Login() {
  const navigate = useNavigate();
  const { setSession } = useAuthStore();
  const trpc = useTRPC();

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const loginMutation = useMutation(
    trpc.auth.login.mutationOptions({
      onSuccess: (result) => {
        const user = result?.user as any;
        if (!user || !result.token) return;
        if (user.role !== 'admin' && user.role !== 'librarian') {
          alert('Access denied. Only librarian accounts can log in here.');
          return;
        }
        setSession(result.token, {
          id: user.id,
          name: user.name,
          id_number: user.id_number,
          role: user.role,
          institution_id: user.institution_id,
        });
        navigate('/dashboard', { replace: true });
      },
      onError: () => {},
    }),
  );

  const onSubmit = (data: FormData) =>
    loginMutation.mutate({ idNumber: data.idNumber, pin: data.pin });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* drag strip for decoration-less window */}
      <div data-tauri-drag-region className="h-8 w-full shrink-0" />
      <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center mb-2">
            <span className="text-primary-foreground font-bold text-lg">B</span>
          </div>
          <CardTitle className="text-2xl font-bold">Bookleaf</CardTitle>
          <CardDescription>Sign in with your librarian ID and PIN</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="idNumber">Library ID</Label>
              <Input id="idNumber" placeholder="e.g. LIB-001" {...register('idNumber')} />
              {errors.idNumber && <p className="text-xs text-destructive">{errors.idNumber.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pin">PIN</Label>
              <Input id="pin" type="password" placeholder="PIN" {...register('pin')} />
              {errors.pin && <p className="text-xs text-destructive">{errors.pin.message}</p>}
            </div>
            {loginMutation.error && (
              <p className="text-xs text-destructive">{getTRPCErrorMessage(loginMutation.error)}</p>
            )}
            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
