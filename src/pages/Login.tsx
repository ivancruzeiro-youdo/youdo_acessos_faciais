import { useState, useEffect } from "react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Label } from "@/components/ui/label";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { useNavigate } from "react-router-dom";

import { useAuth } from "@/contexts/AuthContext";

import { toast } from "sonner";



export default function Login() {

  const [email, setEmail] = useState("");

  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const { user, signIn } = useAuth();

  const mode = "login";



  useEffect(() => {

    if (user) navigate("/", { replace: true });

  }, [user, navigate]);



  const handleLogin = async (e: React.FormEvent) => {

    e.preventDefault();

    setLoading(true);

    try {

      await signIn(email, password);

      navigate("/");

    } catch (err: any) {

      toast.error(err.message);

    } finally {

      setLoading(false);

    }

  };



  return (

    <div className="min-h-screen flex items-center justify-center bg-background p-4">

      <div className="w-full max-w-md">

        <div className="flex items-center justify-center mb-8">

          <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center mr-3">

            <span className="text-primary-foreground font-bold text-lg">FV</span>

          </div>

          <div>

            <h1 className="text-2xl font-bold text-foreground">Facial V3</h1>

            <p className="text-sm text-muted-foreground">Gestão de Controle de Acesso</p>

          </div>

        </div>



        <Card>

          <CardHeader>

            <CardTitle>Entrar</CardTitle>

            <CardDescription>Acesse o painel de gestão</CardDescription>

          </CardHeader>

          <CardContent>

            <form onSubmit={handleLogin} className="space-y-4">

              <div className="space-y-2">

                <Label htmlFor="email">Email</Label>

                <Input

                  id="email"

                  type="email"

                  value={email}

                  onChange={(e) => setEmail(e.target.value)}

                  placeholder="seu@email.com"

                  required

                />

              </div>

              <div className="space-y-2">

                  <Label htmlFor="password">Senha</Label>

                  <Input

                    id="password"

                    type="password"

                    value={password}

                    onChange={(e) => setPassword(e.target.value)}

                    placeholder="••••••••"

                    required

                  />

                </div>

              <Button type="submit" className="w-full" disabled={loading}>

                {loading ? "Aguarde..." : "Entrar"}

              </Button>

            </form>

          </CardContent>

        </Card>

      </div>

    </div>

  );

}

